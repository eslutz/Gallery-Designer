import { ModalDialog } from '../../shared/ui/ModalDialog';

export function RestoreLibraryDialog({
  open,
  designCount,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  designCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalDialog
      open={open}
      title="Restore all designs?"
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="primary destructive" onClick={onConfirm}>
            Restore backup
          </button>
        </>
      }
    >
      <p>
        Restoring this backup will replace all locally saved designs with its {designCount} design
        {designCount === 1 ? '' : 's'}. This cannot be undone.
      </p>
    </ModalDialog>
  );
}
