---
name: yelim-article-publishing
description: Use when publishing, editing, importing, correcting, auditing, or resuming Yelim product articles from images, supplier posts, product sheets, or admin data. Covers studio image treatment, category intelligence, variants vs duplicate articles, image compression, Firestore/Storage payloads, vendor matching, delivery/shipping/station-transport fields, checkpoints, and post-publication verification.
---

# Yelim Article Publishing

Use a plan-first workflow. Preserve the original supplier image as evidence, separate image treatment from publication, and make every production write resumable and auditable.

## Required context and routing

Before doing anything else, read `/Users/burkinbila/.codex/skills/yelim-project-context/SKILL.md` when it exists. If it is unavailable, say so and use [references/project-routing.md](references/project-routing.md) plus the selected project's `AGENTS.md` as the fallback context.

For article batches and Firestore/Storage utilities, default to `/Users/burkinbila/Desktop/YelimVideoGen`. For the browser admin publisher, use `/Users/burkinbila/Desktop/yelim-site`.

Read the references needed for the task:

- Product fields, vendor matching, variants, prices, and provenance: [references/article-contract.md](references/article-contract.md)
- Category, subcategory, and hashtag selection: [references/taxonomy.md](references/taxonomy.md)
- Mandatory studio prompt and image review: [references/studio-image-rules.md](references/studio-image-rules.md)
- Historical Monde De L’electro defaults and lessons, only when that batch is relevant: [references/legacy-electro-batch.md](references/legacy-electro-batch.md)

## Classify the request

Choose one mode before acting:

1. **Audit or resume:** read plans, source images, studio outputs, Firestore, and Storage metadata without writing production data.
2. **Prepare:** inspect original images and produce or revise a product plan. Do not publish.
3. **Studio:** generate edited product images locally. Do not upload or publish unless explicitly requested.
4. **Publish:** validate, upload images, create/update Firestore documents, and verify results. An explicit request to publish authorizes these scoped writes.
5. **Correct:** audit the existing document first, show the intended field-level change, then write only when correction is explicitly requested.

Never interpret “préparer”, “analyser”, “traiter les images”, or “vérifier” as permission to write to Firestore or Storage.

## 1. Establish the batch

Record:

- Firebase project and database; production is currently `school-hub-bdf8f` and `(default)`.
- Source directory, studio output directory, plan path, canonical vendor, and true supplier/source.
- Campaign defaults for stock, delivery, shipping, station transport, limits, delay, weight, and shippability.
- Existing vendor document and existing articles for that vendor.

Prefer `gcloud` plus the Firestore REST API for read-only audits when gcloud authentication is available. Use the YelimVideoGen service account only for a controlled script that genuinely needs Firebase Admin. Never print credentials or access tokens.

## 2. Inspect every original image before studio treatment

Process sources in stable filename order. Use OCR when helpful, but visually inspect each original image before editing it.

For each source:

- Extract only visible or independently verified product facts.
- Record product name, brand, type, most-specific collection, options, prices, characteristics, hashtags, and shipping assumptions.
- Record all evidence of variants: length, size, capacity, quality, specification, power, model, pack, color, storage, connector, or any other selectable difference.
- Group multiple rows or images into one article when they are variants of the same product family.
- Mark exact duplicate files and map them to a canonical source.
- Set `publishable: false` and add `uncertainty` when price, model, identity, variant grouping, or another material fact is ambiguous.

Do not invent specifications from appearance. Do not edit away the supplier evidence before the product and variant plan has been saved.

## 3. Make the variant decision before publication

Every product must receive an explicit variant review, including products that ultimately have no variants.

- Same core product with different lengths, sizes, colors, capacities, qualities, specifications, powers, storage, models, or packs: publish one article with variants.
- Meaningfully different products with separate customer expectations, categories, images, or shipping behavior: use separate articles.
- Example: a computer cable offered as `3 m = 5 000 FCFA` and `6 m = 7 000 FCFA` is one article with a required length variant, a base price of `5 000`, and supplements of `0` and `2 000`.

Before constructing a variant payload, inspect the current implementation in `/Users/burkinbila/Desktop/yelim-site/admin/publier-article/app.js`, especially the functions that build variants, purchase options, and the article payload. Match the current admin contract rather than relying on memory.

Follow [references/article-contract.md](references/article-contract.md) for additive dimensions, combined variants, option image/color behavior, and price supplements.

## 4. Build and validate the plan

Persist a JSON plan before studio work or publication. Include batch metadata and one product object per intended article. Keep source filenames and required studio sources so recovery is deterministic. Record the variant review in `variantAssessment` when the plan format permits it.

Run:

```bash
python3 scripts/validate_product_plan.py /absolute/path/to/plan.json \
  --source-dir "/absolute/path/to/source-images" \
  --vendor-term "Vendor display name" \
  --vendor-term "Supplier/source name"
```

The validator is read-only. Fix errors rather than bypassing them. Non-publishable products may remain as an explicit waiting list.

## 5. Choose taxonomy, vendor, and public text

Audit live taxonomy and similar articles before classifying. Choose the most-specific valid term as `nomCollection`, use ancestors and relevant synonyms as hashtags, and follow [references/taxonomy.md](references/taxonomy.md).

Match `vendeur` against an existing canonical `Fournisseurs` document by exact and fuzzy name. Never invent a vendor document. If no match exists, stop and ask whether to create one or use another existing vendor.

Keep vendor and supplier names out of public description, specification, keywords, and product hashtags unless the user explicitly wants storefront branding there. Preserve provenance in `vendeur`, `fournisseurSource`, and `vraiFournisseur`.

Exclude price lines from product characteristics. Prices belong in price and option fields.

## 6. Create studio images

Use the `imagegen` skill for every product-image edit. Apply the prompt in [references/studio-image-rules.md](references/studio-image-rules.md) to every image.

For each required source:

1. Inspect the original with `view_image`.
2. Confirm that all product and variant facts have already been saved in the plan.
3. Apply the mandatory studio prompt.
4. Save a deterministic square, high-resolution PNG under the planned studio directory.
5. Inspect the output and compare product, colors, textures, proportions, logo, connectors, controls, and included accessories against the original.
6. Reject and regenerate any output that changes product identity, leaves a distraction, or introduces unsupported objects or text.

For visually distinct variants, create one studio image per source and associate each option with its own image. Do not reuse a misleading image across distinct variants.

## 7. Audit before publishing

Before any upload or Firestore write:

- Re-run plan validation.
- Confirm every publishable product has all required studio files.
- Confirm the variant review against the original image and current admin variant contract.
- Confirm `hashtags` contains `nomCollection` plus every ancestor returned by live `Config/Taxonomy.category_hierarchy`; a missing category parent is a blocking validation error.
- Confirm `prixLivraison`, `prixExpedition`, and `fraisTransportPourLivrerALaGare` are all explicitly defined for every article.
- Reject a missing station-transport fee or a value of `0` unless free station transport was explicitly requested and recorded.
- Compare normalized `(vendor, product name)` and source basenames with existing Firestore articles.
- Treat an existing match as an update candidate, never as permission to create a duplicate.
- Present counts: planned, ready, waiting, already existing, and new.

Use `scripts/audit_publication_state.py` for a read-only resume audit. Pass `--response-json` to inspect a saved Firestore response without network access.

## 8. Publish through a controlled campaign script

Prefer a focused, reviewable script in `/Users/burkinbila/Desktop/YelimVideoGen` over ad-hoc console writes. Match `buildArticlePayload()`, `buildPurchaseOptions()`, and the current variant builder in the web admin.

For each new article:

1. Compress studio images to WebP, normally at most 1600 px on the longest side with quality around `0.78`, without destroying product detail.
2. Upload to `article_images/` with a unique object name and correct metadata.
3. Build the payload following [references/article-contract.md](references/article-contract.md).
4. Create the Firestore document using the established ID convention.
5. Increment `Config/Stats.totalArticles` only for a genuinely new document.
6. Verify the saved document and fetch its main image URL successfully.

For an existing article, merge only intended fields. Preserve its ID, bookmarks, images, vectors, timestamps, and unknown fields unless explicitly targeted.

When consolidating duplicate articles into one variant article, delete only the confirmed duplicates, decrement `Config/Stats.totalArticles` by the number deleted, and verify the count from live documents.

## 9. Verify and checkpoint

After every write, read the article back and verify:

- identity, category, vendor, supplier provenance, stock, prices, and purchase options;
- `nomCollection` and the complete taxonomy chain in `hashtags`, from the selected subcategory/category through its grande category;
- variants, base price, supplements, mandatory selection, option image/color behavior;
- `prixLivraison`, `prixExpedition`, and `fraisTransportPourLivrerALaGare`;
- limits, shippability, weight, delay, main image, and product images.

Fail verification if any of the three transport-price fields is missing. Fail if station transport is `0` without an explicit free-transport instruction. There is no `optionsAchat` equivalent for `fraisTransportPourLivrerALaGare`; verify it at the article root. Verify that `optionsAchat` mirrors delivery and shipping values.

Also fail verification when `hashtags` omits `nomCollection` or any live taxonomy ancestor. Do not compensate by creating taxonomy when a suitable existing branch already exists.

Recompute vendor article count only after successful verification. Record created/updated IDs, skipped products, compressed sizes, image checks, and the next source to process. Do not claim success until read-back verification passes.

## 10. Resume after interruption

Reconstruct state from authoritative evidence, in this order:

1. Saved plan and campaign script.
2. Firestore articles and their source/treated-image provenance.
3. Existing studio outputs.
4. Ordered source directory.

The resume point is the first publishable planned product absent from Firestore or lacking a verified studio output. Report earlier products blocked by `publishable: false` or `uncertainty` separately.

Never infer completion solely from a generated image or solely from a Firestore ID; verify both stages.
