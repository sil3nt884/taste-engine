import type {ListMedia, MediaListCollectionResponse, MediaListStatus} from "../types";
import {ANILIST_ENDPOINT} from "../consts";

const USER_LIST_BY_STATUS_QUERY = `
query ($userName: String, $status: MediaListStatus) {
  MediaListCollection(userName: $userName, type: ANIME, status: $status) {
    lists {
      name
      entries {
        media {
          id
          title {
            userPreferred
            romaji
            english
          }
          coverImage {
            extraLarge
            large
            medium
          }
          bannerImage
          genres
          tags {
            name
            rank
            isMediaSpoiler
          }
          averageScore
          popularity
          format
          episodes
          startDate {
            year
          }
        }
      }
    }
  }
}`;

async function fetchListByStatus(
  userName: string,
  status: MediaListStatus,
  signal?: AbortSignal,
): Promise<ListMedia[]> {
  const response = await fetch(ANILIST_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      query: USER_LIST_BY_STATUS_QUERY,
      variables: { userName, status },
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`AniList ${response.status}: ${await response.text()}`);
  }

  const body = (await response.json()) as {
    data?: MediaListCollectionResponse;
    errors?: unknown;
  };

  if (body.errors || !body.data) {
    throw new Error(`AniList GraphQL: ${JSON.stringify(body.errors)}`);
  }

  return body.data.MediaListCollection.lists
    .flatMap((list) => list.entries)
    .map((entry) => entry.media);
}

export function importWatchedList(
  userName: string,
  signal?: AbortSignal,
): Promise<ListMedia[]> {
  return fetchListByStatus(userName, 'COMPLETED', signal);
}

export function importPlanToWatchList(
  userName: string,
  signal?: AbortSignal,
): Promise<ListMedia[]> {
  return fetchListByStatus(userName, 'PLANNING', signal);
}
