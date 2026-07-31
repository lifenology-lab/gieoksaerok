const DEFAULT_API_BASE_URL = "";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL
).replace(/\/$/, "");

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, options);

  if (!response.ok) {
    let message = "API 요청 중 문제가 발생했어요.";
    const text = await response.text();

    try {
      const data = JSON.parse(text);
      message = data.detail || JSON.stringify(data);
    } catch {
      message = text || message;
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export function getMemoryAlbumPhotoUrl(photoUrl) {
  if (!photoUrl) {
    return "";
  }

  if (/^https?:\/\//.test(photoUrl)) {
    return photoUrl;
  }

  return `${API_BASE_URL}${photoUrl.startsWith("/") ? "" : "/"}${photoUrl}`;
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
}) {
  const formData = new FormData();

  formData.append("photo", photo);
  formData.append("description", description);
  formData.append("crop_x", cropX);
  formData.append("crop_y", cropY);

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
