import { TopicIcon } from '@ui/content/TopicIcon';
import type { StatusInfoItem } from '@ui/control/StatusInfo';

/**
 * Which Group may edit the thing, as a status every editor with group access states the same way.
 * Its own module, apart from `AuthoringToolbar`: public detail pages state it too, and the toolbar's loader brings the board geometry library with it.
 */
export function groupAccessStatus(groupName: string | null): StatusInfoItem {
  return {
    icon: <TopicIcon topic="groups" size={16} />,
    label: groupName == null ? 'No group has access.' : `Group access: ${groupName}`,
  };
}
