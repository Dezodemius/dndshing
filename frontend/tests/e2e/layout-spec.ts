export type LayoutStatus = 'implemented' | 'partial' | 'out_of_scope' | 'own_extension'

export interface SheetLayoutSpecEntry {
  id: string
  labelKey: string
  page: 1 | 2 | 3 | 4
  column: 'left' | 'center' | 'right' | 'all'
  row: number
  status: LayoutStatus
  reason?: string
}

/**
 * Named printable-sheet regions transcribed from the four supplied references.
 * Non-implemented rows must state why so a missing section cannot disappear
 * behind an opaque count assertion.
 */
export const SHEET_LAYOUT_SPEC: readonly SheetLayoutSpecEntry[] = [
  { id: 'identity', labelKey: 'pages.printableSheet.labels.characterName', page: 1, column: 'all', row: 1, status: 'implemented' },
  { id: 'abilities', labelKey: 'abilities.str', page: 1, column: 'left', row: 1, status: 'implemented' },
  { id: 'inspiration', labelKey: 'pages.printableSheet.labels.inspiration', page: 1, column: 'left', row: 2, status: 'implemented' },
  { id: 'saves', labelKey: 'pages.printableSheet.blocks.saves', page: 1, column: 'left', row: 3, status: 'implemented' },
  { id: 'skills', labelKey: 'pages.printableSheet.blocks.skills', page: 1, column: 'left', row: 4, status: 'implemented' },
  { id: 'passive-perception', labelKey: 'pages.printableSheet.labels.passivePerception', page: 1, column: 'left', row: 5, status: 'implemented' },
  { id: 'proficiencies', labelKey: 'pages.printableSheet.blocks.proficiencies', page: 1, column: 'left', row: 6, status: 'implemented' },
  { id: 'combat', labelKey: 'pages.printableSheet.labels.ac', page: 1, column: 'center', row: 1, status: 'implemented' },
  { id: 'attacks', labelKey: 'pages.printableSheet.blocks.attacks', page: 1, column: 'center', row: 2, status: 'implemented' },
  { id: 'currency', labelKey: 'pages.printableSheet.labels.gold', page: 1, column: 'center', row: 3, status: 'implemented' },
  { id: 'equipment', labelKey: 'pages.printableSheet.blocks.equipment', page: 1, column: 'center', row: 4, status: 'implemented' },
  { id: 'personality', labelKey: 'pages.printableSheet.blocks.personality', page: 1, column: 'right', row: 1, status: 'implemented' },
  { id: 'ideals', labelKey: 'pages.printableSheet.blocks.ideals', page: 1, column: 'right', row: 2, status: 'implemented' },
  { id: 'bonds', labelKey: 'pages.printableSheet.blocks.bonds', page: 1, column: 'right', row: 3, status: 'implemented' },
  { id: 'flaws', labelKey: 'pages.printableSheet.blocks.flaws', page: 1, column: 'right', row: 4, status: 'implemented' },
  { id: 'features-summary', labelKey: 'pages.printableSheet.blocks.features', page: 1, column: 'right', row: 5, status: 'implemented' },
  { id: 'identity', labelKey: 'pages.printableSheet.labels.characterName', page: 2, column: 'all', row: 1, status: 'implemented' },
  { id: 'portrait', labelKey: 'pages.printableSheet.blocks.portrait', page: 2, column: 'left', row: 1, status: 'partial', reason: 'DND-106 owns portrait upload; this page intentionally provides only the printable empty area.' },
  { id: 'appearance', labelKey: 'pages.printableSheet.blocks.appearance', page: 2, column: 'left', row: 2, status: 'implemented' },
  { id: 'backstory', labelKey: 'pages.printableSheet.blocks.backstory', page: 2, column: 'left', row: 3, status: 'implemented' },
  { id: 'goals', labelKey: 'pages.printableSheet.blocks.goals', page: 2, column: 'left', row: 4, status: 'implemented' },
  { id: 'allies', labelKey: 'pages.printableSheet.blocks.allies', page: 2, column: 'right', row: 1, status: 'implemented' },
  { id: 'feats', labelKey: 'pages.printableSheet.blocks.feats', page: 2, column: 'right', row: 2, status: 'implemented' },
  { id: 'extra_features', labelKey: 'pages.printableSheet.blocks.extraFeatures', page: 2, column: 'right', row: 3, status: 'implemented' },
  { id: 'treasures', labelKey: 'pages.printableSheet.blocks.treasures', page: 2, column: 'right', row: 4, status: 'implemented' },
  { id: 'identity', labelKey: 'pages.printableSheet.labels.characterName', page: 3, column: 'all', row: 1, status: 'implemented' },
  { id: 'features', labelKey: 'pages.printableSheet.blocks.features', page: 3, column: 'left', row: 1, status: 'implemented' },
  { id: 'notes', labelKey: 'pages.printableSheet.blocks.notes', page: 3, column: 'right', row: 1, status: 'implemented' },
  { id: 'spells', labelKey: 'pages.printableSheet.labels.spellAbility', page: 4, column: 'all', row: 1, status: 'implemented' },
]
