export { FocusSpaceView } from "./focus-space-view";
export { DesignFocusSpaceView } from "./design-focus-space-view";
export {
  FocusWorkspaceProvider,
  useFocusWorkspace,
  useOptionalFocusWorkspace,
} from "./focus-interaction-context";
export {
  FocusContextSidebar,
  WorkspaceContextRail,
} from "./focus-context-sidebar";
export {
  buildFocusLevelSummary,
  buildStructureLevelSummary,
  toFocusRows,
  toStructureRows,
  type FocusLevelSummary,
  type FocusPieSlice,
  type FocusPieWeightSource,
} from "./focus-pie-adapter";
export {
  FocusCompositionPie,
  FocusCompositionLegend,
} from "./focus-composition-pie";
export {
  defaultFocusColor,
  resolveFocusColor,
  loadFocusColorOverrides,
  pickUnusedFocusColor,
  pickUnusedFocusColors,
  allocateUniqueFocusColors,
} from "./focus-blob-color";
export {
  loadFocusIconOverrides,
  resolveFocusIcon,
  saveFocusIconOverrides,
} from "./focus-blob-icon";
export { IconPicker } from "./icon-picker";
export { FocusBlobs } from "./focus-blobs";
export { FocusRelationsControl } from "./focus-relations-control";
export { FocusRelationLayer } from "./focus-relation-layer";
export {
  calculateRelationStrength,
  scoreVisibleRelations,
  filterRelationsForMode,
  MIN_VISIBLE_RELATION,
  STRONG_RELATION_THRESHOLD,
  RELATION_WEIGHTS,
} from "./relation-strength";
export type {
  RelationMode,
  ScoredRelation,
  RelationSignalBreakdown,
} from "./relation-strength";
export { AddFocusBlobControl } from "./add-focus-blob-control";
export { AddStructureBlobControl } from "./add-structure-blob-control";
export { FocusBlobPropertiesDialog } from "./focus-blob-properties-dialog";
export { StructureBlobPropertiesDialog } from "./structure-blob-properties-dialog";
export { FocusIdeaEditor } from "./focus-idea-editor";
export { StructureNodeEditor } from "./structure-node-editor";
export { StructureViewSwitcher } from "./structure-view-switcher";
export { structureFocusHref, parseStructureView } from "./structure-href";
export type { StructureViewMode } from "./structure-href";
export { StructureTreePanel } from "./structure-tree-panel";
export { StructureDetailsPanel } from "./structure-details-panel";
export { StructureSuggestButton } from "./structure-suggest-button";
export { CombineNotesControl } from "./combine-notes-control";
export { buildFocusLevelSummaryCopy } from "./focus-level-copy";
export { IDLE_SATELLITE_COUNT } from "./focus-blob-color";
export {
  blobDiameterPx,
  blobPadNorm,
  blobPadNormSize,
  blobsOverlap,
  clampBlobDiameter,
  clampBlobNorm,
  clampBlobNormSize,
  clampBlobRectSize,
  defaultBlobPositions,
  defaultNoteRectPx,
  isBlobRectSize,
  loadBlobPositions,
  loadBlobSizes,
  saveBlobPositions,
  saveBlobSizes,
  removeBlobPositions,
  separateBlobPositions,
  separateMovedBlob,
  MIN_BLOB_VISUAL_COMPOSITION_PCT,
} from "./focus-blob-layout";
export type { BlobRectSize, BlobSizeValue } from "./focus-blob-layout";
export type {
  FocusHoverSource,
  FocusGenreInfo,
  NodeClassificationRow,
} from "./focus-interaction-context";
