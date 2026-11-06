export function findMenuImageUrlColumn(headers: string[]) {
  const imageUrlIndex = headers.indexOf("image_url");

  return imageUrlIndex >= 0
    ? imageUrlIndex
    : headers.indexOf("item_image_url");
}
