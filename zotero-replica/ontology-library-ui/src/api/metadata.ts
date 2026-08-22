import { apiClient } from './client';

/**
 * Schema/reference endpoints (MappingsController.java) - public, no auth
 * required. Used to drive the metadata-editing form: which fields are valid
 * for a given item type, and which creator types it accepts.
 */
export function getItemTypeFields(itemType: string): Promise<string[]> {
  return apiClient
    .get<{ field: string; localized: string }[]>('/itemTypeFields', { params: { itemType } })
    .then((rows) => rows.map((r) => r.field));
}

export function getItemTypeCreatorTypes(itemType: string): Promise<string[]> {
  return apiClient
    .get<{ creatorType: string; localized: string }[]>('/itemTypeCreatorTypes', { params: { itemType } })
    .then((rows) => rows.map((r) => r.creatorType));
}
