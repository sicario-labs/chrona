import os
from PIL import Image, ImageOps
import numpy as np

def make_transparent_from_dark(input_path, output_path, color=(255, 255, 255)):
    """Convert white logo on black background to transparent PNG with white pixels"""
    img = Image.open(input_path).convert('L')
    # Use grayscale values directly as alpha channel
    alpha = np.array(img, dtype=np.uint8)
    
    # Clean up very low noise levels
    alpha = np.where(alpha < 15, 0, alpha)
    # Stretch upper end for clean solid glyphs
    alpha = np.clip((alpha.astype(np.float32) / 255.0 * 1.08) * 255.0, 0, 255).astype(np.uint8)
    
    # Create RGB channels with target color
    r = np.full_like(alpha, color[0])
    g = np.full_like(alpha, color[1])
    b = np.full_like(alpha, color[2])
    
    rgba = np.stack([r, g, b, alpha], axis=2)
    out = Image.fromarray(rgba, 'RGBA')
    out.save(output_path, 'PNG', optimize=True)
    print(f"Saved: {output_path}")

def make_transparent_from_light(input_path, output_path, color=(10, 10, 10)):
    """Convert black logo on white background to transparent PNG with dark pixels"""
    img = Image.open(input_path).convert('L')
    # Invert grayscale values: white (255) becomes 0 (transparent), black (0) becomes 255 (opaque)
    inv = ImageOps.invert(img)
    alpha = np.array(inv, dtype=np.uint8)
    
    # Clean up low noise
    alpha = np.where(alpha < 15, 0, alpha)
    alpha = np.clip((alpha.astype(np.float32) / 255.0 * 1.08) * 255.0, 0, 255).astype(np.uint8)
    
    r = np.full_like(alpha, color[0])
    g = np.full_like(alpha, color[1])
    b = np.full_like(alpha, color[2])
    
    rgba = np.stack([r, g, b, alpha], axis=2)
    out = Image.fromarray(rgba, 'RGBA')
    out.save(output_path, 'PNG', optimize=True)
    print(f"Saved: {output_path}")

def main():
    dirs = [
        "apps/docs/public/brand",
        "apps/console/public/brand",
        "chrona-logos/processed"
    ]
    for d in dirs:
        os.makedirs(d, exist_ok=True)
        
    icon_src = "chrona-logos/chrona-icon.png"
    dark_src = "chrona-logos/dark-logo.png"
    light_src = "chrona-logos/light-logo.png"
    
    # Generate transparent icon (dark mode = white glyph, light mode = dark glyph)
    make_transparent_from_dark(icon_src, "chrona-logos/processed/chrona-icon-dark.png", (255, 255, 255))
    make_transparent_from_dark(icon_src, "chrona-logos/processed/chrona-icon-light.png", (14, 16, 20))
    
    # Generate transparent wordmark (dark mode = white, light mode = dark)
    make_transparent_from_dark(dark_src, "chrona-logos/processed/chrona-logo-dark.png", (255, 255, 255))
    make_transparent_from_light(light_src, "chrona-logos/processed/chrona-logo-light.png", (14, 16, 20))
    
    # Copy to apps/docs and apps/console
    for brand_dir in ["apps/docs/public/brand", "apps/console/public/brand"]:
        for name in ["chrona-icon-dark.png", "chrona-icon-light.png", "chrona-logo-dark.png", "chrona-logo-light.png"]:
            src_file = os.path.join("chrona-logos/processed", name)
            dest_file = os.path.join(brand_dir, name)
            Image.open(src_file).save(dest_file)
            print(f"Copied {src_file} -> {dest_file}")

if __name__ == "__main__":
    main()
