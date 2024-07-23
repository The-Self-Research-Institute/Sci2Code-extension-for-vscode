const ZOTERO_BASE_URI = "https://api.zotero.org";

export const getUserDetails = async (apiKey:string) => {
  return await fetch(`${ZOTERO_BASE_URI}/keys/${apiKey}`, {
    method: "GET",
    headers: {
      "content-type": "application/json",
    },
  });
};

export const getZoteroCollections = async (userId: string, apiKey:string) => {
  return await fetch(`${ZOTERO_BASE_URI}/users/${userId}/items`, {
    method: "GET",
    headers: {
      "content-type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
  });
};
