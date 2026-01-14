#!/usr/bin/env python3
"""
Convert variable TTF fonts to static TTF fonts using fonttools instancer.

This script creates static font instances from variable fonts by "pinning"
the variable axes to specific values. This is necessary because jsPDF
requires static fonts with format 4/12 cmap tables, but variable fonts
use format 14 cmap tables which jsPDF doesn't support.

Usage:
    python3 convert-to-static.py <input.ttf> <output.ttf> <weight> [italic]

Examples:
    python3 convert-to-static.py Roboto-Variable.ttf Roboto-Regular.ttf 400
    python3 convert-to-static.py Roboto-Variable.ttf Roboto-Bold.ttf 700
    python3 convert-to-static.py Roboto-Variable.ttf Roboto-Italic.ttf 400 italic
"""

import sys
import os

try:
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer
except ImportError:
    print("Error: fonttools not installed. Run: pip install fonttools brotli")
    sys.exit(1)


def convert_variable_to_static(input_path, output_path, weight=400, italic=False):
    """
    Convert a variable font to a static font at the specified weight.

    Args:
        input_path: Path to the input variable TTF font
        output_path: Path to save the static TTF font
        weight: Font weight (100-900, default 400 = Regular)
        italic: Whether to create an italic instance
    """
    varfont = TTFont(input_path)

    # Check if it's actually a variable font
    if 'fvar' not in varfont:
        # Already static, just copy
        print(f"  Font is already static, copying as-is")
        varfont.save(output_path)
        varfont.close()
        return True

    # Get available axes
    fvar = varfont['fvar']
    axis_tags = [axis.axisTag for axis in fvar.axes]

    # Build axis limits - pin each axis to a specific value
    axis_limits = {}

    # Weight axis (wght)
    if 'wght' in axis_tags:
        axis_limits['wght'] = weight

    # Width axis (wdth) - pin to normal width (100)
    if 'wdth' in axis_tags:
        axis_limits['wdth'] = 100

    # Italic axis (ital) - 0 or 1
    if 'ital' in axis_tags:
        axis_limits['ital'] = 1 if italic else 0

    # Slant axis (slnt) - for fonts that use slant instead of italic
    if 'slnt' in axis_tags:
        # Typical italic slant is around -12 degrees
        axis_limits['slnt'] = -12 if italic else 0

    # Optical size axis (opsz) - pin to default if present
    if 'opsz' in axis_tags:
        # Find the default optical size
        for axis in fvar.axes:
            if axis.axisTag == 'opsz':
                axis_limits['opsz'] = axis.defaultValue
                break

    print(f"  Pinning axes: {axis_limits}")

    # Create static instance
    try:
        static_font = instancer.instantiateVariableFont(
            varfont,
            axis_limits,
            inplace=False,
            optimize=True,
            updateFontNames=True
        )

        static_font.save(output_path)
        static_font.close()
        varfont.close()
        return True

    except Exception as e:
        print(f"  Error creating static instance: {e}")
        varfont.close()
        return False


def main():
    if len(sys.argv) < 4:
        print("Usage: convert-to-static.py <input.ttf> <output.ttf> <weight> [italic]")
        print("")
        print("Arguments:")
        print("  input.ttf   - Path to input variable font")
        print("  output.ttf  - Path for output static font")
        print("  weight      - Font weight (100-900)")
        print("  italic      - Optional: 'italic' to create italic instance")
        print("")
        print("Examples:")
        print("  python3 convert-to-static.py Roboto[wght].ttf Roboto-Regular.ttf 400")
        print("  python3 convert-to-static.py Roboto[wght].ttf Roboto-Bold.ttf 700")
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2]
    weight = int(sys.argv[3])
    italic = len(sys.argv) > 4 and sys.argv[4].lower() == 'italic'

    if not os.path.exists(input_file):
        print(f"Error: Input file not found: {input_file}")
        sys.exit(1)

    print(f"Converting: {input_file} -> {output_file}")
    print(f"  Weight: {weight}, Italic: {italic}")

    success = convert_variable_to_static(input_file, output_file, weight, italic)

    if success:
        size = os.path.getsize(output_file)
        print(f"  Created static font: {output_file} ({size:,} bytes)")
        sys.exit(0)
    else:
        print(f"  Failed to create static font")
        sys.exit(1)


if __name__ == '__main__':
    main()
