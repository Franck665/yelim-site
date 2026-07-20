# Taxonomy selection

Use live taxonomy as the source of truth. Before classifying a product, read:

- `Config/Taxonomy`, including `all_grande_categories`, `all_categories`, `all_sous_categories`, `all_tags`, `all_hashtags`, `category_hierarchy`, `categories`, and `categoryTemplates`;
- nested documents under `grande_categories/*/Categories/*/SousCategories/*`;
- similar `Articles` and their `nomCollection`/`hashtags`;
- articles from the same vendor when relevant.

Do not hardcode one domain as the default and do not classify from the batch folder alone.

## Decision method

1. Identify the product family from the original image, name, specifications, and vendor context.
2. Build candidates from exact/near-exact subcategories, then categories, hierarchy parents, broad categories, and similar article collections.
3. Score exact product-family fit before semantic domain fit and vendor context.
4. Choose the most-specific existing customer-facing term as `nomCollection`, even when it belongs to a different broad domain than the batch.
5. Walk upward through `category_hierarchy` and add **every** ancestor plus factual product terms to `hashtags`. This is mandatory, not optional discovery enrichment.
6. If only a broad category exists, use it and add precise product tags.
7. Create taxonomy only when no existing strong product-family match exists. Attach a new subcategory under the best existing parent rather than creating a parallel branch.

Example: a USB PC-compatible game controller still belongs under the existing gaming/controller taxonomy when that is the stronger customer-facing match; USB compatibility alone does not make it an informatique article.

Example of the required payload expansion:

```text
nomCollection: adaptateurs vidéo
category_hierarchy: adaptateurs vidéo -> adaptateurs informatiques -> équipements informatiques
hashtags: adaptateurs vidéo, adaptateurs informatiques, équipements informatiques, ...product tags
```

Before writing an article, fail validation if `nomCollection` or any ancestor from the live hierarchy is absent from `hashtags`. Create a category or subcategory only when no suitable existing branch exists.

## Domain examples

Use these as patterns, never as hardcoded defaults:

- Bags: prefer a precise term such as `sacs à main femme` when live taxonomy contains it.
- Clothes: use precise robe/maillot/homme/femme children; size and color are usually variants.
- Shoes: choose precise basket/sneaker/soulier/nu-pied terms; shoe size and color are usually variants.
- Phones/accessories: use existing phone brand, chargeur, powerbank, écouteur, or coque children and attach their parent hierarchy.
- Computing: prefer ordinateur, disque dur, clavier, souris, câble, or equipment children found live.
- Gaming/controllers: prefer console/accessory/controller terms even when USB or PC compatible.
- Beauty: use the precise skincare, soap, perfume, hair-care, or equivalent child found live.
- Home/kitchen: use precise bouilloire, mixeur, air fryer, foyer, plaque, or micro-ondes children and their parents.
- Air conditioners: existing practice may keep `nomCollection = produits électroménagers` and use `climatiseur`/`climatiseurs` as tags when no stronger live collection exists.

## Public hashtag rules

- Preserve canonical Firestore spelling and casing.
- Keep tags factual and directly relevant.
- Exclude vendor/supplier names, phone numbers, locations, prices, and campaign slogans unless explicitly requested.
- Avoid gratuitous singular/plural duplicates.
- Do not replace a precise existing subcategory with a broad category.

## Taxonomy writes

Taxonomy modification is a separate production write. After authorization:

1. Run a read-only audit and propose the exact parent chain.
2. Ensure `grande_categories/{Grande}` exists with `{ nom, image }`.
3. Ensure its `Categories/{Category}` document exists with `{ nom, image }`.
4. Ensure `SousCategories/{Sous}` exists with `{ nom, image }` when needed.
5. Merge additions into `Config/Taxonomy` arrays using array-union semantics.
6. Update `category_hierarchy` with lowercase keys: grande -> `[]`, category -> `[grande]`, subcategory -> `[category, grande]`.
7. Update `valuesToOperateChangeInRealtimeForApp/config.categoriesLastUpdated` so apps refresh taxonomy.
8. Read back category documents, arrays, and hierarchy entries.

Preserve existing naming conventions: display forms in category arrays, lowercase/search forms in tags, hashtags, and hierarchy keys. Never replace the taxonomy document wholesale.
