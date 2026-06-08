// Compatibility shim for legacy islands in environments where slots are expected
// to be mounted immediately (including unit tests).
export const awaitSlot = (slotId, mountFn) => {
  if (typeof document === 'undefined') return false;
  if (typeof mountFn === 'function') {
    const slot = document.getElementById(slotId);
    if (slot) {
      return mountFn();
    }
  }
  return false;
};
export const MOUNT_FLAG = true;
