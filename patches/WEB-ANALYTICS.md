# Cadence page analytics

Cloudflare Web Analytics is installed manually on the existing GitHub Pages landing page. No DNS changes, proxy, separate domain, or self-hosted redirect collector are needed. The deferred beacon is independent of delivery and the installer.

The HTML contains the public collection identifier intended for browsers. Cloudflare API credentials stay in the existing local environment file and are never included in the repository or archive.

View page loads and page performance in Cloudflare Dashboard → Analytics & Logs → Web Analytics → veeskelad.github.io. Filter the URL path to `/cadence/` when examining Cadence. Telegram source/start/delivery/catalog events remain in the bot database; these aggregate reports do not join individual visitors across services.

A reported page view is not an installation. This change does not track successful installs or prompt-copy clicks. Blocked JavaScript or a blocked beacon can omit a page view. Do not interpret test traffic as organic conversion. The released1.4 ZIP, pointer and hashes are unchanged.

Reference: https://developers.cloudflare.com/web-analytics/get-started/
