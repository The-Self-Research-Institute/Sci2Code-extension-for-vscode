import { apiClient } from './client';
import type { Group } from './types';

/** Self-service only - dataserver requires the caller's own userId here. */
export function listMyGroups(userId: string): Promise<Group[]> {
  return apiClient.get<Group[]>(`/users/${userId}/groups`);
}

export function getGroup(groupId: number | string): Promise<Group> {
  return apiClient.get<Group>(`/groups/${groupId}`);
}