import { Message, MessageOverride } from '../types';

/**
 * Resolve the display content for a message, honoring the Lens override layer.
 * Returns the raw message content when lens is off or no override exists.
 */
export const resolveContent = (
  msg: Message,
  overrides: MessageOverride[] | undefined,
  lensOn: boolean,
): string => {
  if (!lensOn || !overrides || overrides.length === 0) return msg.content;
  const override = overrides
    .filter(o => o.messageId === msg.id)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  // A blank override would make the message vanish from the reader —
  // never trust one, whatever wrote it.
  return override && override.content.trim() ? override.content : msg.content;
};

/** Check whether a message has any Lens override applied. */
export const hasOverride = (
  msg: Message,
  overrides: MessageOverride[] | undefined,
): boolean => {
  if (!overrides || overrides.length === 0) return false;
  return overrides.some(o => o.messageId === msg.id);
};
