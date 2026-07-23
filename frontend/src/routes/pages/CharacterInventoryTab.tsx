import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  addInventoryItem,
  deleteInventoryItem,
  updateInventoryItem,
  type CharacterDetail,
  type InventoryEntry,
} from '../../api/characters'
import { listItems, type Item } from '../../api/content'
import { translateApiError } from '../../api/errorMessages'

const customItemSchema = z.object({
  custom_name: z.string().min(1).max(200),
  quantity: z.coerce.number().int().min(1),
})

type CustomItemFormValues = z.infer<typeof customItemSchema>

function entryName(entry: InventoryEntry, itemsById: Map<number, Item>): string {
  if (entry.item_id !== null) {
    return itemsById.get(entry.item_id)?.name ?? entry.item_id.toString()
  }
  return entry.custom_name ?? ''
}

interface InventoryEntryRowProps {
  characterId: string
  entry: InventoryEntry
  name: string
}

function InventoryEntryRow({ characterId, entry, name }: InventoryEntryRowProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [quantity, setQuantity] = useState(String(entry.quantity))

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['character', characterId] })

  const updateMutation = useMutation({
    mutationFn: (payload: { quantity?: number; equipped?: boolean }) =>
      updateInventoryItem(characterId, entry.id, payload),
    onSuccess: invalidate,
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteInventoryItem(characterId, entry.id),
    onSuccess: invalidate,
  })

  function commitQuantity() {
    const parsed = Number.parseInt(quantity, 10)
    if (!Number.isFinite(parsed) || parsed < 1 || parsed === entry.quantity) {
      setQuantity(String(entry.quantity))
      return
    }
    updateMutation.mutate({ quantity: parsed })
  }

  function handleDelete() {
    if (!window.confirm(t('pages.characterSheet.inventory.deleteConfirm', { name }))) return
    deleteMutation.mutate()
  }

  return (
    <li className="character-sheet__list-item character-sheet__inventory-item">
      <span className="character-sheet__list-label">{name}</span>
      <label className="character-sheet__inventory-qty">
        <span className="character-sheet__visually-hidden">
          {t('pages.characterSheet.inventory.quantity')}
        </span>
        <input
          type="number"
          min={1}
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          onBlur={commitQuantity}
          disabled={updateMutation.isPending || deleteMutation.isPending}
        />
      </label>
      <label className="character-sheet__inventory-equipped">
        <input
          type="checkbox"
          checked={entry.equipped}
          onChange={(event) => updateMutation.mutate({ equipped: event.target.checked })}
          disabled={updateMutation.isPending || deleteMutation.isPending}
        />
        {t('pages.characterSheet.inventory.equipped')}
      </label>
      <button
        type="button"
        onClick={handleDelete}
        disabled={updateMutation.isPending || deleteMutation.isPending}
      >
        {t('pages.characterSheet.inventory.delete')}
      </button>
      {(updateMutation.isError || deleteMutation.isError) && (
        <p role="alert">
          {translateApiError(t, updateMutation.error ?? deleteMutation.error)}
        </p>
      )}
    </li>
  )
}

interface CharacterInventoryTabProps {
  characterId: string
  character: CharacterDetail
}

export default function CharacterInventoryTab({
  characterId,
  character,
}: CharacterInventoryTabProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')

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
    const query = search.trim().toLowerCase()
    if (!query) return []
    return (itemsQuery.data ?? [])
      .filter((item) => item.name.toLowerCase().includes(query))
      .slice(0, 20)
  }, [itemsQuery.data, search])

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['character', characterId] })

  const addFromCatalogMutation = useMutation({
    mutationFn: (item: Item) => addInventoryItem(characterId, { item_id: item.id, quantity: 1 }),
    onSuccess: invalidate,
  })

  const addCustomMutation = useMutation({
    mutationFn: (payload: CustomItemFormValues) => addInventoryItem(characterId, payload),
    onSuccess: invalidate,
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CustomItemFormValues>({
    resolver: zodResolver(customItemSchema),
    defaultValues: { custom_name: '', quantity: 1 },
  })

  async function onSubmitCustom(values: CustomItemFormValues) {
    await addCustomMutation.mutateAsync(values)
    reset({ custom_name: '', quantity: 1 })
  }

  return (
    <div className="character-sheet__inventory">
      <section className="character-sheet__section" aria-labelledby="inventory-list-heading">
        <h2 id="inventory-list-heading">{t('pages.characterSheet.tabs.inventory')}</h2>
        {character.inventory.length === 0 ? (
          <p>{t('pages.characterSheet.inventory.empty')}</p>
        ) : (
          <ul className="character-sheet__list">
            {character.inventory.map((entry) => (
              <InventoryEntryRow
                key={entry.id}
                characterId={characterId}
                entry={entry}
                name={entryName(entry, itemsById)}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="character-sheet__section" aria-labelledby="inventory-add-heading">
        <h2 id="inventory-add-heading">{t('pages.characterSheet.inventory.addTitle')}</h2>
        <div className="character-sheet__field">
          <label htmlFor="inventory-search">{t('pages.characterSheet.inventory.searchLabel')}</label>
          <input
            id="inventory-search"
            type="text"
            value={search}
            placeholder={t('pages.characterSheet.inventory.searchPlaceholder')}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {search.trim() && (
          <ul className="character-sheet__list">
            {searchResults.length === 0 && <li>{t('pages.characterSheet.inventory.noResults')}</li>}
            {searchResults.map((item) => (
              <li className="character-sheet__list-item" key={item.id}>
                <span className="character-sheet__list-label">{item.name}</span>
                <button
                  type="button"
                  onClick={() => addFromCatalogMutation.mutate(item)}
                  disabled={addFromCatalogMutation.isPending}
                >
                  {t('pages.characterSheet.inventory.addFromCatalog')}
                </button>
              </li>
            ))}
          </ul>
        )}
        {addFromCatalogMutation.isError && (
          <p role="alert">{translateApiError(t, addFromCatalogMutation.error)}</p>
        )}

        <h3>{t('pages.characterSheet.inventory.customTitle')}</h3>
        <form onSubmit={handleSubmit(onSubmitCustom)} noValidate>
          <div className="character-sheet__field">
            <label htmlFor="inventory-custom-name">
              {t('pages.characterSheet.inventory.customNameLabel')}
            </label>
            <input
              id="inventory-custom-name"
              type="text"
              placeholder={t('pages.characterSheet.inventory.customNamePlaceholder')}
              {...register('custom_name')}
            />
            {errors.custom_name && (
              <p role="alert">{t('pages.characterSheet.inventory.invalidCustomName')}</p>
            )}
          </div>
          <div className="character-sheet__field">
            <label htmlFor="inventory-custom-quantity">
              {t('pages.characterSheet.inventory.quantityLabel')}
            </label>
            <input
              id="inventory-custom-quantity"
              type="number"
              min={1}
              {...register('quantity')}
            />
            {errors.quantity && (
              <p role="alert">{t('pages.characterSheet.inventory.invalidQuantity')}</p>
            )}
          </div>
          <button type="submit" disabled={isSubmitting}>
            {t('pages.characterSheet.inventory.addCustom')}
          </button>
          {addCustomMutation.isError && (
            <p role="alert">{translateApiError(t, addCustomMutation.error)}</p>
          )}
        </form>
      </section>
    </div>
  )
}
