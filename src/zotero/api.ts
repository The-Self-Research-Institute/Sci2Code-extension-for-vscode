const ZOTERO_BASE_URI = "https://api.zotero.org";

export const getUserDetails = async (apiKey: string) => {
  try {
    console.log('[Sci2Code API] Fetching user details...');
    const response = await fetch(`${ZOTERO_BASE_URI}/keys/${apiKey}`, {
      method: "GET",
      headers: {
        "content-type": "application/json",
      },
    });
    console.log('[Sci2Code API] User details response status:', response.status);
    return response;
  } catch (error) {
    console.error('[Sci2Code API] Error fetching user details:', error);
    throw error;
  }
};

export const getZoteroCollections = async (userId: string, apiKey: string) => {
  try {
    console.log('[Sci2Code API] Fetching items for user:', userId);
    const response = await fetch(`${ZOTERO_BASE_URI}/users/${userId}/items`, {
      method: "GET",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    });
    console.log('[Sci2Code API] Items response status:', response.status);
    return response;
  } catch (error) {
    console.error('[Sci2Code API] Error fetching items:', error);
    throw error;
  }
};

export const fetchZoteroItem = async (
  userId: string,
  itemKey: string,
  apiKey: string
) => {
  return await fetch(`${ZOTERO_BASE_URI}/users/${userId}/items/${itemKey}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
  });
};

export const updateZoteroTags = async (
  userId: string,
  itemKey: string,
  apiKey: string,
  version: number,
  updatedTags: any
) => {
  return await fetch(`${ZOTERO_BASE_URI}/users/${userId}/items/${itemKey}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "If-Unmodified-Since-Version": version.toString(),
    },
    body: JSON.stringify({
      tags: updatedTags,
    }),
  });
};
