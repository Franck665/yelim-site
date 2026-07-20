# Article contract

Treat the current iOS/Android models and deployed backend as canonical when they disagree with this reconstruction.

## Identity and catalogue

- `articleId`: string; normally equal to the Firestore document ID.
- `nom`: public product name.
- `nomCollection`: most-specific taxonomy term.
- `vendeur`: storefront/vendor display name.
- `fournisseurSource` and `vraiFournisseur`: supplier provenance used by automated imports.
- `date`: legacy local string formatted `YYYY-MM-DD HH:mm:ss` in current publishers.
- `estPlaceholder`: boolean, normally `false`.

## Images and provenance

- `mainImage`: first/default Firebase Storage URL.
- `productImages`: unique ordered Storage URLs.
- `sourceImages`: absolute local source paths for automated imports.
- `treatedImageLocalPath`: legacy single treated path.
- `treatedImageLocalPaths`: current list of treated paths.
- Keep provenance fields for recovery; do not expose local paths in public UI.

## Text and discovery

- `desc`: concise factual public description.
- `specification`: structured factual details; avoid unsupported claims.
- `hashtags`: normalized category/ancestor/product terms.
- `keywords`: lowercase accent-folded tokens and prefixes, capped around 500 values.
- `lienVideo`: string, empty when absent.
- Remove vendor/supplier branding from public product text unless explicitly requested.

## Vendor matching

Query `Fournisseurs` by exact and fuzzy name before publishing. Use the canonical existing `nom` so `logoBoutique`, grouping, and counts stay consistent. Never invent a vendor document; if no match exists, stop and ask whether to create one or use another vendor.

## Price, stock, and delivery

- `prix`, `prixAchat`, `prixNonReduit`: integer FCFA.
- `stock`: positive integer for a publishable stocked item.
- `prixLivraison`, `fraisTransportPourLivrerALaGare`, `prixExpedition`: required integer FCFA fields on every publishable article.
- `quantiteLimite`, `quantiteLimiteExpedition`: positive integers.
- `poidsColis`: current values include `léger`, `moyen`, and `lourd`.
- `delaiLivraison`: human-readable legacy string such as `2 heures`.
- `peutEtreExpedier`: boolean.

Campaign defaults are not global business rules. Record them per plan and confirm them before publishing. Existing Medium Technologies evidence used stock 25, delivery 1,000, station transport 1,000, delivery limit 10, expedition limit 3, and delay 2 hours.

Never leave `fraisTransportPourLivrerALaGare` missing or `0` unless the user explicitly requested free station transport and that exception is recorded. For a normal quick publication with no supplied value, use `1000` for delivery, shipping, and station transport and clearly record that default.

## Legacy booleans and state

- `precommande`: legacy string `"true"` or `"false"`.
- `tranchable`: legacy string `"true"` or `"false"`.
- `typePrecommande`: string; normally `locale` when inactive.
- `isDerniereMinute`, `paiementProgressifEnabled`, `venteParQuantiteSpecifique`, `venteIndividuelleAutorisee`: booleans.
- Preserve existing field types. Do not “clean up” legacy strings during an unrelated correction.

## Purchase options

`optionsAchat` contains one or more maps. A normal item uses a `detail` option with:

- `id`, `label`, `uniteVente`, `quantiteIncluse`
- `prix`, `prixAchat`, `prixLivraison`, `prixExpedition`
- `estGros`, `quantiteMinimumCommande`, `incrementQuantite`
- `quantiteLimiteLivraison`, `quantiteLimiteExpedition`

For wholesale/multiple-unit sales, also maintain the compatible root fields: `uniteVente`, `quantiteParUnite`, `prixUniteVente`, `prixAchatUniteVente`, `prixPieceIndividuelle`, unit shipping/delivery prices, and unit limits.

Mirror `prixLivraison` and `prixExpedition` plus their quantity limits between the article root and `optionsAchat`. There is no `optionsAchat` field for `fraisTransportPourLivrerALaGare`; verify it directly at the root.

## Variants

Inspect the original supplier image before studio treatment and explicitly decide whether differences in length, color, quality, specification, capacity, size, power, storage, model, connector, or pack belong in one article. Before constructing the payload, inspect the current variant and purchase-option builders in `/Users/burkinbila/Desktop/yelim-site/admin/publier-article/app.js`.

`variants` is a list of maps:

```json
{
  "nom": "taille",
  "mustBeSelected": true,
  "options": [
    {
      "valeur": "XL",
      "prixSupplementaire": 0,
      "imageUrl": "",
      "couleurHexa": null,
      "stability": 0,
      "hasDistinctImage": false
    }
  ]
}
```

- Store price differences in `prixSupplementaire` relative to the article base price.
- Set the article `prix` and `prixAchat` to the cheapest/default option.
- Use one variant entry per independent additive decision dimension. Use one combined dimension when the supplier price table is not additive.
- Set `mustBeSelected: true` when the customer must choose an option.
- Use a specific `imageUrl` only when the option truly has a distinct image.
- Keep textual variants such as length, size, capacity, power, model, or layout with an empty `imageUrl` and null/empty `couleurHexa` unless the option truly has its own image or color swatch. Mobile clients use those fields to choose special selectors; do not fill them merely to reuse the article image.
- Do not split one selectable product into duplicate articles, and do not merge separate products merely because they share a brand or flyer.

Example: cable lengths `3 m = 5 000` and `6 m = 7 000` become one required `longueur` variant, base price `5 000`, supplements `0` and `2 000`.

Other patterns:

- Plaque chauffante: one `puissance` variant, `500W +0`, `1000W +1500`.
- Micro-ondes: one `capacité` variant, `20L +0`, `25L +10000`.
- A price table such as air-conditioner technology plus power that is not cleanly additive: use one combined `modèle` dimension rather than creating misleading independent supplements.

## Restriction and misc fields

Preserve current contract fields such as `restrictionAge`, `categorieRestreinte`, `requiresAgeVerification`, `ageMinimum`, `reductions`, `bookmarkedBy`, `randomInt`, and `randomInt1` through `randomInt4`.

Never overwrite `bookmarkedBy`, vector/embedding fields, or unknown backend-managed fields during a targeted correction.

## Counters

- Increment `Config/Stats.totalArticles` only after creating a genuinely new article.
- When confirmed duplicate documents are removed after consolidation into variants, decrement `Config/Stats.totalArticles` by the number removed and verify the live total.
- Recompute `Fournisseurs.nombreArticles` from actual vendor articles after a batch.
- Never increment counts for an existing-document text correction.
