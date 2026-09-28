import { permanentRedirect } from 'next/navigation';

/**
 * WooCommerce's shop page. On the live site /shop/ 301s to the homepage, but
 * the mini-cart's "חזור לחנות" links here, so we send it to the actual shop
 * front, /הטבות-לקהילה/ (not in the live sitemap; no parity impact).
 */
export default function ShopPage() {
  permanentRedirect(encodeURI('/הטבות-לקהילה/'));
}
