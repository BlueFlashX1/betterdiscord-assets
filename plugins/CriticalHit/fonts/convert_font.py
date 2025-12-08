#!/usr/bin/env python3
"""
Convert TTF font to WOFF and WOFF2 formats
Requires: pip install fonttools[woff]
"""

import os
import sys
from pathlib import Path


def convert_ttf_to_woff(ttf_path, output_dir=None):
    """Convert TTF to WOFF format"""
    try:
        from fontTools.ttLib import TTFont

        ttf = TTFont(ttf_path)
        if output_dir is None:
            output_dir = os.path.dirname(ttf_path)

        woff_path = os.path.join(output_dir, ttf_path.replace(".ttf", ".woff"))
        ttf.flavor = "woff"
        ttf.save(woff_path)
        print(f"✓ Created: {woff_path}")
        return woff_path
    except ImportError:
        print(
            "ERROR: fonttools not installed. Install with: pip3 install fonttools[woff]"
        )
        return None
    except Exception as e:
        print(f"ERROR converting to WOFF: {e}")
        return None


def convert_ttf_to_woff2(ttf_path, output_dir=None):
    """Convert TTF to WOFF2 format"""
    try:
        from fontTools.ttLib import TTFont

        ttf = TTFont(ttf_path)
        if output_dir is None:
            output_dir = os.path.dirname(ttf_path)

        woff2_path = os.path.join(output_dir, ttf_path.replace(".ttf", ".woff2"))

        # Save as WOFF2 using fontTools
        ttf.flavor = "woff2"
        ttf.save(woff2_path)

        print(f"✓ Created: {woff2_path}")
        return woff2_path
    except ImportError as e:
        print(f"ERROR: Missing dependency - {e}")
        print("Install with: pip3 install fonttools brotli")
        return None
    except Exception as e:
        # Check if it's a brotli error
        if "brotli" in str(e).lower() or "woff2" in str(e).lower():
            print(
                "ERROR: WOFF2 compression requires brotli. Install with: pip3 install brotli"
            )
        else:
            print(f"ERROR converting to WOFF2: {e}")
        return None


def main():
    script_dir = Path(__file__).parent
    ttf_file = script_dir / "SpeedySpaceGoatOddity.ttf"

    if not ttf_file.exists():
        print(f"ERROR: Font file not found: {ttf_file}")
        sys.exit(1)

    print(f"Converting: {ttf_file.name}")
    print(f"Location: {ttf_file.parent}")
    print()

    # Convert to WOFF
    print("Converting to WOFF...")
    woff_path = convert_ttf_to_woff(str(ttf_file))

    # Convert to WOFF2
    print("Converting to WOFF2...")
    woff2_path = convert_ttf_to_woff2(str(ttf_file))

    if woff_path and woff2_path:
        print()
        print("✓ Conversion complete!")
        print(f"  - WOFF:  {Path(woff_path).name}")
        print(f"  - WOFF2: {Path(woff2_path).name}")
    else:
        print()
        print("✗ Conversion failed. Please install fonttools:")
        print("  pip3 install fonttools[woff]")
        sys.exit(1)


if __name__ == "__main__":
    main()
