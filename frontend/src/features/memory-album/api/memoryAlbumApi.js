import { getApiMediaUrl, request } from "../../../shared/api/client";

export function getMemoryAlbumPhotoUrl(photoUrl) {
  return getApiMediaUrl(photoUrl);
}

export function fetchMemoryAlbumItems(personId) {
  return request(`/api/people/${personId}/memory-album/`);
}

export function createMemoryAlbumItem({
  personId,
  photo,
  description,
  cropX,
  cropY,
  source,
}) {
  const formData = new FormData();

  formData.append("photo", photo);
  formData.append("description", description);
  formData.append("crop_x", cropX);
  formData.append("crop_y", cropY);

  if (source) {
    formData.append("source", source);
  }

  return request(`/api/people/${personId}/memory-album/`, {
    method: "POST",
    body: formData,
  });
}

export function deleteMemoryAlbumItem({ personId, itemId }) {
  return request(`/api/people/${personId}/memory-album/${itemId}/`, {
    method: "DELETE",
  });
}
