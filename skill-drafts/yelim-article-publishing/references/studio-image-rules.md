# Mandatory studio image treatment

Apply the following prompt to every product image after the original has been analyzed and its product/variant facts have been saved:

```text
Transform this product image into a clean, professional studio shot for an e-commerce app.

Requirements:
- Remove the background completely and replace it with a pure white background (#FFFFFF).
- Keep only the main product. Remove all text unless it is the product's brand mark, and remove price tags, baskets, or other distractions.
- Ensure the product is perfectly centered and occupies 80–90% of the frame.
- Preserve the original colors and textures accurately, with no color shift.
- Apply soft, natural studio lighting with a subtle, realistic shadow beneath the product.
- Fill transparent or reflective areas naturally, including glass and plastic.
- Improve sharpness and clarity while avoiding over-processing.
- Make the output look like a high-end Amazon-style catalogue product image.
- Maintain the original proportions and do not distort the product.
- Output format: high resolution, square (1:1), pure white background, clean edges, and no artifacts.
```

This prompt is authoritative for studio output. Do not retain supplier flyers, price text, telephone numbers, locations, shop logos, promotional badges, baskets, decorative scenes, or unrelated packaging. Preserve only legitimate branding printed on the product itself when it can be reproduced accurately.

Do not invent a headline, specification, accessory, connector, color, logo, texture, or product detail. Do not regenerate garbled substitute text.

## Output

- Generate a square, high-resolution PNG, normally at least 1024×1024.
- Keep the product fully visible, centered, and at 80–90% of the frame.
- Name output deterministically from the source, for example `IMG_4631.JPG` -> `studio_manual/IMG_4631.png`.
- Keep a separate studio file for every source required by a visually distinct variant.

## Review checklist

Compare original and output side by side:

1. Same product/model and included pieces.
2. Same colors, textures, proportions, connector/control layout, and product brand mark.
3. Product centered and occupying 80–90% of a square frame.
4. Background is pure white `#FFFFFF` with only a subtle grounding shadow.
5. No vendor, supplier, price, contact, flyer, basket, or decorative remnants.
6. No invented, malformed, or non-brand text.
7. Clean edges, natural transparent/reflective areas, and no artifacts.

Reject the image if an identity-bearing detail changed. A polished but inaccurate image is not publishable.
