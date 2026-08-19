/**
 * Dataserver dual-mounts most endpoints at /users/{ownerId}/... and
 * /groups/{ownerId}/... behind the same handler (LibraryAccessResolver).
 * This is the one place that path prefix is built.
 */
export interface LibraryOwner {
  kind: 'users' | 'groups';
  id: string | number;
}

export function ownerBase(owner: LibraryOwner): string {
  return `/${owner.kind}/${owner.id}`;
}