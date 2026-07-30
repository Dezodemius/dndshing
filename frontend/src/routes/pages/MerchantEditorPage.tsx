import { useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  addMerchantItem,
  createMerchant,
  deleteMerchant,
  deleteMerchantItem,
  getMerchant,
  patchMerchant,
  updateMerchantItem,
  type MerchantDetail,
  type MerchantItem,
  type MerchantItemPatch,
  type MerchantPatch,
} from '../../api/merchants'
import { listItems, type Item } from '../../api/content'
import { translateApiError } from '../../api/errorMessages'
import './MerchantEditorPage.css'

const cardSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000),
})

type CardFormValues = z.infer<typeof cardSchema>

function toCardValues(merchant: MerchantDetail): CardFormValues {
  return { name: merchant.name, description: merchant.description ?? '' }
}

type PriceField = 'price_g' | 'price_s' | 'price_c'
const PRICE_FIELDS: PriceField[] = ['price_g', 'price_s', 'price_c']

function parseOptionalNonNegativeInt(value: string): number | null | 'invalid' {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = Number.parseInt(trimmed, 10)
  if (!Number.isFinite(parsed) || parsed < 0 || String(parsed) !== trimmed) return 'invalid'
  return parsed
}

interface MerchantItemRowProps {
  merchantId: string
  entry: MerchantItem
  item: Item | undefined
}

function MerchantItemRow({ merchantId, entry, item }: MerchantItemRowProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [priceG, setPriceG] = useState(entry.price_g === null ? '' : String(entry.price_g))
  const [priceS, setPriceS] = useState(entry.price_s === null ? '' : String(entry.price_s))
  const [priceC, setPriceC] = useState(entry.price_c === null ? '' : String(entry.price_c))
  const [quantity, setQuantity] = useState(entry.quantity === null ? '' : String(entry.quantity))
  const priceSetters: Record<PriceField, (value: string) => void> = {
    price_g: setPriceG,
    price_s: setPriceS,
    price_c: setPriceC,
  }
  const priceValues: Record<PriceField, string> = {
    price_g: priceG,
    price_s: priceS,
    price_c: priceC,
  }

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['merchant', merchantId] })

  const updateMutation = useMutation({
    mutationFn: (payload: MerchantItemPatch) => updateMerchantItem(merchantId, entry.id, payload),
    onSuccess: invalidate,
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteMerchantItem(merchantId, entry.id),
    onSuccess: invalidate,
  })

  function commitPrice(field: PriceField) {
    const raw = priceValues[field]
    const parsed = parseOptionalNonNegativeInt(raw)
    if (parsed === 'invalid') {
      priceSetters[field](entry[field] === null ? '' : String(entry[field]))
      return
    }
    if (parsed === entry[field]) return
    updateMutation.mutate({ [field]: parsed })
  }

  function commitQuantity() {
    const parsed = parseOptionalNonNegativeInt(quantity)
    if (parsed === 'invalid') {
      setQuantity(entry.quantity === null ? '' : String(entry.quantity))
      return
    }
    if (parsed === entry.quantity) return
    updateMutation.mutate({ quantity: parsed })
  }

  function handleDelete() {
    const name = item?.name ?? String(entry.item_id)
    if (!window.confirm(t('pages.merchantEditor.items.deleteConfirm', { name }))) return
    deleteMutation.mutate()
  }

  const busy = updateMutation.isPending || deleteMutation.isPending

  return (
    <li className="merchant-editor__list-item">
      <div className="merchant-editor__item-header">
        <span className="merchant-editor__list-label">{item?.name ?? entry.item_id}</span>
        {item && (
          <span className="merchant-editor__catalog-price">
            {t('pages.merchantEditor.items.catalogPrice', {
              price: `${item.price_g} ${t('pages.merchantEditor.items.gold')} ${item.price_s} ${t(
                'pages.merchantEditor.items.silver',
              )} ${item.price_c} ${t('pages.merchantEditor.items.copper')}`,
            })}
          </span>
        )}
      </div>
      <div className="merchant-editor__item-fields">
        {PRICE_FIELDS.map((field) => (
          <label className="merchant-editor__field" key={field}>
            <span className="merchant-editor__visually-hidden">
              {t(`pages.merchantEditor.items.${field === 'price_g' ? 'gold' : field === 'price_s' ? 'silver' : 'copper'}`)}
            </span>
            <input
              type="number"
              min={0}
              placeholder={t(`pages.merchantEditor.items.${field === 'price_g' ? 'gold' : field === 'price_s' ? 'silver' : 'copper'}`)}
              value={priceValues[field]}
              onChange={(event) => priceSetters[field](event.target.value)}
              onBlur={() => commitPrice(field)}
              disabled={busy}
            />
          </label>
        ))}
        <label className="merchant-editor__field">
          <span className="merchant-editor__visually-hidden">
            {t('pages.merchantEditor.items.quantityLabel')}
          </span>
          <input
            type="number"
            min={0}
            placeholder="∞"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            onBlur={commitQuantity}
            disabled={busy}
          />
        </label>
        <button type="button" onClick={handleDelete} disabled={busy}>
          {t('pages.merchantEditor.items.delete')}
        </button>
      </div>
      {(updateMutation.isError || deleteMutation.isError) && (
        <p role="alert">{translateApiError(t, updateMutation.error ?? deleteMutation.error)}</p>
      )}
    </li>
  )
}

function CreateMerchantForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CardFormValues>({
    resolver: zodResolver(cardSchema),
    defaultValues: { name: '', description: '' },
  })

  const createMutation = useMutation({
    mutationFn: (values: CardFormValues) =>
      createMerchant({
        name: values.name,
        description: values.description.trim() === '' ? null : values.description,
      }),
    onSuccess: (created) => navigate(`/app/merchants/${created.id}`, { replace: true }),
  })

  return (
    <section className="merchant-editor">
      <h1>{t('pages.merchantEditor.title')}</h1>
      <form onSubmit={handleSubmit((values) => createMutation.mutate(values))} noValidate>
        <h2>{t('pages.merchantEditor.create.heading')}</h2>
        <div className="merchant-editor__field">
          <label htmlFor="merchant-create-name">{t('pages.merchantEditor.create.nameLabel')}</label>
          <input
            id="merchant-create-name"
            type="text"
            placeholder={t('pages.merchantEditor.create.namePlaceholder')}
            {...register('name')}
          />
          {errors.name && <p role="alert">{t('pages.merchantEditor.create.invalidName')}</p>}
        </div>
        <div className="merchant-editor__field">
          <label htmlFor="merchant-create-description">
            {t('pages.merchantEditor.create.descriptionLabel')}
          </label>
          <textarea
            id="merchant-create-description"
            maxLength={2000}
            placeholder={t('pages.merchantEditor.create.descriptionPlaceholder')}
            {...register('description')}
          />
        </div>
        <button type="submit" disabled={isSubmitting}>
          {t('pages.merchantEditor.create.submit')}
        </button>
        {createMutation.isError && <p role="alert">{translateApiError(t, createMutation.error)}</p>}
      </form>
    </section>
  )
}

interface MerchantEditorProps {
  merchantId: string
}

function MerchantEditor({ merchantId }: MerchantEditorProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [copied, setCopied] = useState(false)
  const savedOnce = useRef(false)

  const query = useQuery({
    queryKey: ['merchant', merchantId],
    queryFn: () => getMerchant(merchantId),
  })

  const itemsQuery = useQuery({
    queryKey: ['content', 'items'],
    queryFn: () => listItems(),
    staleTime: 5 * 60 * 1000,
  })

  const itemsById = useMemo(() => {
    const map = new Map<number, Item>()
    for (const item of itemsQuery.data ?? []) {
      map.set(item.id, item)
    }
    return map
  }, [itemsQuery.data])

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    return (itemsQuery.data ?? []).filter((item) => item.name.toLowerCase().includes(q)).slice(0, 20)
  }, [itemsQuery.data, search])

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, dirtyFields, isSubmitting },
  } = useForm<CardFormValues>({
    resolver: zodResolver(cardSchema),
    values: query.data ? toCardValues(query.data) : undefined,
    resetOptions: { keepDirtyValues: true },
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['merchant', merchantId] })

  const patchMutation = useMutation({
    mutationFn: (payload: MerchantPatch) => patchMerchant(merchantId, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(['merchant', merchantId], updated)
      reset(toCardValues(updated))
    },
  })

  const openMutation = useMutation({
    mutationFn: (is_open: boolean) => patchMerchant(merchantId, { is_open }),
    onSuccess: (updated) => queryClient.setQueryData(['merchant', merchantId], updated),
  })

  const addItemMutation = useMutation({
    mutationFn: (item: Item) => addMerchantItem(merchantId, { item_id: item.id }),
    onSuccess: invalidate,
  })

  const deleteMerchantMutation = useMutation({
    mutationFn: () => deleteMerchant(merchantId),
    onSuccess: () => navigate('/app', { replace: true }),
  })

  async function onSubmitCard(values: CardFormValues) {
    const payload: MerchantPatch = {}
    if (dirtyFields.name) payload.name = values.name
    if (dirtyFields.description) {
      payload.description = values.description.trim() === '' ? null : values.description
    }
    if (Object.keys(payload).length === 0) return
    savedOnce.current = true
    await patchMutation.mutateAsync(payload)
  }

  async function handleCopyLink(shareCode: string) {
    const url = `${window.location.origin}/shop/${shareCode}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  function handleDeleteMerchant(name: string) {
    if (!window.confirm(t('pages.merchantEditor.delete.confirm', { name }))) return
    deleteMerchantMutation.mutate()
  }

  if (query.isLoading) {
    return <p>{t('common.loading')}</p>
  }

  if (query.isError) {
    return <p role="alert">{translateApiError(t, query.error)}</p>
  }

  if (!query.data) {
    return null
  }

  const merchant = query.data
  const shopUrl = `${window.location.origin}/shop/${merchant.share_code}`

  return (
    <section className="merchant-editor">
      <h1>{t('pages.merchantEditor.title')}</h1>

      <form
        className="merchant-editor__section"
        onSubmit={handleSubmit(onSubmitCard)}
        noValidate
        aria-labelledby="merchant-card-heading"
      >
        <h2 id="merchant-card-heading">{merchant.name}</h2>
        <div className="merchant-editor__field">
          <label htmlFor="merchant-name">{t('pages.merchantEditor.card.nameLabel')}</label>
          <input id="merchant-name" type="text" {...register('name')} />
          {errors.name && <p role="alert">{t('pages.merchantEditor.card.invalidName')}</p>}
        </div>
        <div className="merchant-editor__field">
          <label htmlFor="merchant-description">{t('pages.merchantEditor.card.descriptionLabel')}</label>
          <textarea id="merchant-description" maxLength={2000} {...register('description')} />
        </div>
        <label className="merchant-editor__open-toggle">
          <input
            type="checkbox"
            checked={merchant.is_open}
            onChange={(event) => openMutation.mutate(event.target.checked)}
            disabled={openMutation.isPending}
          />
          {t('pages.merchantEditor.card.open')}
        </label>
        <div className="merchant-editor__save-row">
          <button type="submit" disabled={isSubmitting}>
            {t('pages.merchantEditor.card.save')}
          </button>
          {(patchMutation.isError || openMutation.isError) && (
            <p role="alert">{translateApiError(t, patchMutation.error ?? openMutation.error)}</p>
          )}
          {patchMutation.isSuccess && savedOnce.current && <p>{t('pages.merchantEditor.card.saved')}</p>}
        </div>
      </form>

      <section className="merchant-editor__section" aria-labelledby="merchant-link-heading">
        <h2 id="merchant-link-heading">{t('pages.merchantEditor.link.heading')}</h2>
        <div className="merchant-editor__link-row">
          <input type="text" readOnly value={shopUrl} aria-label={t('pages.merchantEditor.link.heading')} />
          <button type="button" onClick={() => handleCopyLink(merchant.share_code)}>
            {t('pages.merchantEditor.link.copy')}
          </button>
        </div>
        {copied && <p>{t('pages.merchantEditor.link.copied')}</p>}
      </section>

      <section className="merchant-editor__section" aria-labelledby="merchant-items-heading">
        <h2 id="merchant-items-heading">{t('pages.merchantEditor.items.heading')}</h2>
        {merchant.items.length === 0 ? (
          <p>{t('pages.merchantEditor.items.empty')}</p>
        ) : (
          <ul className="merchant-editor__list">
            {merchant.items.map((entry) => (
              <MerchantItemRow
                key={entry.id}
                merchantId={merchantId}
                entry={entry}
                item={itemsById.get(entry.item_id)}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="merchant-editor__section" aria-labelledby="merchant-add-item-heading">
        <h2 id="merchant-add-item-heading">{t('pages.merchantEditor.addItem.heading')}</h2>
        <div className="merchant-editor__field">
          <label htmlFor="merchant-item-search">{t('pages.merchantEditor.addItem.searchLabel')}</label>
          <input
            id="merchant-item-search"
            type="text"
            value={search}
            placeholder={t('pages.merchantEditor.addItem.searchPlaceholder')}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {search.trim() && (
          <ul className="merchant-editor__list">
            {searchResults.length === 0 && <li>{t('pages.merchantEditor.addItem.noResults')}</li>}
            {searchResults.map((item) => (
              <li className="merchant-editor__list-item" key={item.id}>
                <span className="merchant-editor__list-label">{item.name}</span>
                <button
                  type="button"
                  onClick={() => addItemMutation.mutate(item)}
                  disabled={addItemMutation.isPending}
                >
                  {t('pages.merchantEditor.addItem.add')}
                </button>
              </li>
            ))}
          </ul>
        )}
        {addItemMutation.isError && <p role="alert">{translateApiError(t, addItemMutation.error)}</p>}
      </section>

      <section className="merchant-editor__section merchant-editor__danger">
        <button type="button" onClick={() => handleDeleteMerchant(merchant.name)}>
          {t('pages.merchantEditor.delete.button')}
        </button>
        {deleteMerchantMutation.isError && (
          <p role="alert">{translateApiError(t, deleteMerchantMutation.error)}</p>
        )}
      </section>
    </section>
  )
}

export default function MerchantEditorPage() {
  const { merchantId } = useParams<{ merchantId: string }>()
  if (!merchantId) {
    return <CreateMerchantForm />
  }
  return <MerchantEditor merchantId={merchantId} />
}
