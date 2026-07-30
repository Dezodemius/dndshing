import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../auth/AuthContext'
import {
  buyFromShop,
  getShop,
  sellToShop,
  type ShopBuyRequest,
  type ShopItem,
  type ShopSellRequest,
} from '../../api/shop'
import {
  getCharacter,
  listCharacters,
  type CharacterDetail,
  type InventoryEntry,
} from '../../api/characters'
import { listItems, type Item } from '../../api/content'
import { translateApiError } from '../../api/errorMessages'
import './ShopPage.css'

function formatCoins(t: TFunction, gold: number, silver: number, copper: number): string {
  return `${gold} ${t('pages.shop.wallet.gold')} ${silver} ${t('pages.shop.wallet.silver')} ${copper} ${t('pages.shop.wallet.copper')}`
}

interface BuyRowProps {
  shareCode: string
  characterId: number
  entry: ShopItem
}

function BuyRow({ shareCode, characterId, entry }: BuyRowProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [quantity, setQuantity] = useState('1')

  const buyMutation = useMutation({
    mutationFn: (payload: ShopBuyRequest) => buyFromShop(shareCode, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shop', shareCode] })
      queryClient.invalidateQueries({ queryKey: ['character', String(characterId)] })
    },
  })

  const outOfStock = entry.quantity !== null && entry.quantity <= 0

  function handleBuy() {
    const qty = Number.parseInt(quantity, 10)
    if (!Number.isFinite(qty) || qty < 1) return
    const total = formatCoins(t, entry.price_g * qty, entry.price_s * qty, entry.price_c * qty)
    if (!window.confirm(t('pages.shop.buy.confirm', { name: entry.name, total }))) return
    buyMutation.mutate({ character_id: characterId, merchant_item_id: entry.id, quantity: qty })
  }

  return (
    <li className="shop-page__list-item">
      <span className="shop-page__list-label">{entry.name}</span>
      <span className="shop-page__price">
        {formatCoins(t, entry.price_g, entry.price_s, entry.price_c)}
      </span>
      <span className="shop-page__stock">
        {entry.quantity === null
          ? t('pages.shop.buy.unlimited')
          : t('pages.shop.buy.stock', { count: entry.quantity })}
      </span>
      <label className="shop-page__qty">
        <span className="shop-page__visually-hidden">{t('pages.shop.buy.quantityLabel')}</span>
        <input
          type="number"
          min={1}
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          disabled={outOfStock || buyMutation.isPending}
        />
      </label>
      <button type="button" onClick={handleBuy} disabled={outOfStock || buyMutation.isPending}>
        {t('pages.shop.buy.submit')}
      </button>
      {buyMutation.isError && <p role="alert">{translateApiError(t, buyMutation.error)}</p>}
    </li>
  )
}

interface SellRowProps {
  shareCode: string
  characterId: number
  entry: InventoryEntry
  item: Item | undefined
}

function SellRow({ shareCode, characterId, entry, item }: SellRowProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [quantity, setQuantity] = useState('1')

  const sellMutation = useMutation({
    mutationFn: (payload: ShopSellRequest) => sellToShop(shareCode, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['character', String(characterId)] })
    },
  })

  if (entry.item_id === null || !item) {
    return (
      <li className="shop-page__list-item">
        <span className="shop-page__list-label">{entry.custom_name}</span>
        <span className="shop-page__note">{t('pages.shop.sell.notSellable')}</span>
      </li>
    )
  }

  function handleSell() {
    const qty = Number.parseInt(quantity, 10)
    if (!Number.isFinite(qty) || qty < 1 || qty > entry.quantity) return
    const total = formatCoins(
      t,
      Math.floor(item!.price_g / 2) * qty,
      Math.floor(item!.price_s / 2) * qty,
      Math.floor(item!.price_c / 2) * qty,
    )
    if (!window.confirm(t('pages.shop.sell.confirm', { name: item!.name, total }))) return
    sellMutation.mutate({ character_id: characterId, inventory_entry_id: entry.id, quantity: qty })
  }

  return (
    <li className="shop-page__list-item">
      <span className="shop-page__list-label">{item.name}</span>
      <span className="shop-page__stock">{t('pages.shop.sell.owned', { count: entry.quantity })}</span>
      <label className="shop-page__qty">
        <span className="shop-page__visually-hidden">{t('pages.shop.sell.quantityLabel')}</span>
        <input
          type="number"
          min={1}
          max={entry.quantity}
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          disabled={sellMutation.isPending}
        />
      </label>
      <button type="button" onClick={handleSell} disabled={sellMutation.isPending}>
        {t('pages.shop.sell.submit')}
      </button>
      {sellMutation.isError && <p role="alert">{translateApiError(t, sellMutation.error)}</p>}
    </li>
  )
}

interface TradingSessionProps {
  shareCode: string
  characterId: number
  shopItems: ShopItem[]
  onLeave: () => void
}

function TradingSession({ shareCode, characterId, shopItems, onLeave }: TradingSessionProps) {
  const { t } = useTranslation()

  const characterQuery = useQuery({
    queryKey: ['character', String(characterId)],
    queryFn: () => getCharacter(String(characterId)),
  })

  const itemsQuery = useQuery({
    queryKey: ['content', 'items'],
    queryFn: () => listItems(),
    staleTime: 5 * 60 * 1000,
  })

  const itemsById = useMemo(() => {
    const map = new Map<number, Item>()
    for (const item of itemsQuery.data ?? []) map.set(item.id, item)
    return map
  }, [itemsQuery.data])

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  if (characterQuery.isLoading) {
    return <p>{t('common.loading')}</p>
  }

  if (characterQuery.isError || !characterQuery.data) {
    return <p role="alert">{translateApiError(t, characterQuery.error)}</p>
  }

  const character: CharacterDetail = characterQuery.data

  return (
    <>
      <section className="shop-page__section" aria-labelledby="shop-wallet-heading">
        <div className="shop-page__wallet-row">
          <h2 id="shop-wallet-heading">{t('pages.shop.wallet.heading')}</h2>
          <button type="button" onClick={onLeave}>
            {t('pages.shop.session.changeCharacter')}
          </button>
        </div>
        <p className="shop-page__wallet-value">
          {formatCoins(t, character.gold, character.silver, character.copper)}
        </p>
      </section>

      <section className="shop-page__section" aria-labelledby="shop-buy-heading">
        <h2 id="shop-buy-heading">{t('pages.shop.buy.heading')}</h2>
        {shopItems.length === 0 ? (
          <p>{t('pages.shop.items.empty')}</p>
        ) : (
          <ul className="shop-page__list">
            {shopItems.map((entry) => (
              <BuyRow key={entry.id} shareCode={shareCode} characterId={characterId} entry={entry} />
            ))}
          </ul>
        )}
      </section>

      <section className="shop-page__section" aria-labelledby="shop-sell-heading">
        <h2 id="shop-sell-heading">{t('pages.shop.sell.heading')}</h2>
        {character.inventory.length === 0 ? (
          <p>{t('pages.shop.sell.empty')}</p>
        ) : (
          <ul className="shop-page__list">
            {character.inventory.map((entry) => (
              <SellRow
                key={entry.id}
                shareCode={shareCode}
                characterId={characterId}
                entry={entry}
                item={entry.item_id !== null ? itemsById.get(entry.item_id) : undefined}
              />
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

export default function ShopPage() {
  const { shareCode } = useParams<{ shareCode: string }>()
  const { t } = useTranslation()
  const { status } = useAuth()
  const [selectedCharacterId, setSelectedCharacterId] = useState<number | null>(null)

  const shopQuery = useQuery({
    queryKey: ['shop', shareCode],
    queryFn: () => getShop(shareCode as string),
    enabled: !!shareCode,
  })

  const charactersQuery = useQuery({
    queryKey: ['characters'],
    queryFn: () => listCharacters(),
    enabled: status === 'authenticated',
  })

  function handleLeaveSession() {
    if (!window.confirm(t('pages.shop.session.leaveConfirm'))) return
    setSelectedCharacterId(null)
  }

  if (shopQuery.isLoading) {
    return <p>{t('common.loading')}</p>
  }

  if (shopQuery.isError || !shopQuery.data) {
    return <p role="alert">{translateApiError(t, shopQuery.error)}</p>
  }

  const shop = shopQuery.data

  return (
    <section className="shop-page">
      <h1>{shop.name}</h1>
      {shop.description && <p className="shop-page__description">{shop.description}</p>}
      {!shop.is_open && <p role="alert">{t('pages.shop.closed')}</p>}

      {status !== 'authenticated' && (
        <section className="shop-page__section" aria-labelledby="shop-guest-heading">
          <h2 id="shop-guest-heading">{t('pages.shop.guest.heading')}</h2>
          <p>{t('pages.shop.guest.body')}</p>
          <Link to="/login">{t('pages.shop.guest.login')}</Link>
        </section>
      )}

      {selectedCharacterId === null && (
        <section className="shop-page__section" aria-labelledby="shop-items-heading">
          <h2 id="shop-items-heading">{t('pages.shop.items.heading')}</h2>
          {shop.items.length === 0 ? (
            <p>{t('pages.shop.items.empty')}</p>
          ) : (
            <ul className="shop-page__list">
              {shop.items.map((entry) => (
                <li key={entry.id} className="shop-page__list-item">
                  <span className="shop-page__list-label">{entry.name}</span>
                  <span className="shop-page__price">
                    {formatCoins(t, entry.price_g, entry.price_s, entry.price_c)}
                  </span>
                  <span className="shop-page__stock">
                    {entry.quantity === null
                      ? t('pages.shop.buy.unlimited')
                      : t('pages.shop.buy.stock', { count: entry.quantity })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {status === 'authenticated' && selectedCharacterId === null && (
        <section className="shop-page__section" aria-labelledby="shop-character-heading">
          <h2 id="shop-character-heading">{t('pages.shop.characterSelect.heading')}</h2>
          {charactersQuery.isLoading && <p>{t('common.loading')}</p>}
          {charactersQuery.isError && (
            <p role="alert">{translateApiError(t, charactersQuery.error)}</p>
          )}
          {charactersQuery.isSuccess && charactersQuery.data.length === 0 && (
            <p>{t('pages.shop.characterSelect.empty')}</p>
          )}
          {charactersQuery.isSuccess && charactersQuery.data.length > 0 && (
            <div className="shop-page__field">
              <label htmlFor="shop-character-select">
                {t('pages.shop.characterSelect.label')}
              </label>
              <select
                id="shop-character-select"
                defaultValue=""
                onChange={(event) => {
                  const value = event.target.value
                  if (value) setSelectedCharacterId(Number(value))
                }}
              >
                <option value="" disabled>
                  {t('pages.shop.characterSelect.placeholder')}
                </option>
                {charactersQuery.data.map((character) => (
                  <option key={character.id} value={character.id}>
                    {character.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </section>
      )}

      {selectedCharacterId !== null && (
        <TradingSession
          shareCode={shareCode as string}
          characterId={selectedCharacterId}
          shopItems={shop.items}
          onLeave={handleLeaveSession}
        />
      )}
    </section>
  )
}
