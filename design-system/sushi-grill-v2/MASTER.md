# Design System: Sushi & Grill v2 (Pro Max)

> **Philosophy**: Premium, minimal, operational. "Real Restaurant" vibes, not AI template.

---

## 1. Brand Identity

- **Core Colors**:
  - **Primary (Brand Red)**: `#DC2626` (Tailwind `red-600`) - Used for CTAs, prices, key highlights.
  - **Primary Hover**: `#B91C1C` (Tailwind `red-700`) - Interaction state.
  - **Secondary (Charcoal)**: `#111827` (Tailwind `slate-950`) - Backgrounds, footers, headings.
  - **Accent**: `#FEF2F2` (Tailwind `red-50`) - Subtle backgrounds, badges.
  - **Neutral**: Slate Scale (`slate-50` to `slate-950`) - Text, borders, dividers.

- **Typography**:
  - **Font Family**: 'IBM Plex Sans Arabic', sans-serif.
  - **Weights**:
    - Light (300) - Occasional details
    - Regular (400) - Body text
    - Medium (500) - Buttons, Labels
    - Bold (700) - Headings, Prices
    - ExtraBold (800) - Hero Titles

---

## 2. Design Tokens

### Spacing & Layout
- **Base Unit**: 4px (Tailwind standard).
- **Container**: `max-w-7xl` (1280px) centered with `px-4 sm:px-6 lg:px-8`.
- **Section Spacing**: `py-12` to `py-16` for breathing room.

### Radius & Shape
- **Cards**: `rounded-2xl` (16px) - Soft, modern feel.
- **Buttons**: `rounded-xl` (12px) - Consistent with inputs.
- **Badges**: `rounded-full` - Pill shape.

### Shadows (Depth)
- **Card Default**: `shadow-sm border border-slate-100` - Subtle definition.
- **Card Hover**: `shadow-md border-red-100` - Lift effect on interaction.
- **Dropdown/Modal**: `shadow-xl border border-slate-100`.

---

## 3. Component Library

### Buttons
- **Primary**: `bg-[#DC2626] text-white hover:bg-[#B91C1C] active:scale-[0.98] transition-all shadow-lg shadow-red-500/20`
- **Secondary**: `bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300`
- **Ghost**: `bg-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900`

### Product Card
- **Structure**: Image (Aspect Ratio 4:3) -> Header (Name + Price) -> Body (Desc) -> Footer (Add Button).
- **Image**: `object-cover w-full h-full hover:scale-105 transition-transform duration-500`.
- **Price**: Brand Red, Bold, Large (`text-lg font-bold text-primary`).

### Admin Dashboard
- **Sidebar**: Dark Charcoal (`bg-slate-950`).
- **Active Tab**: Red-50 background + Red Text (`bg-red-50 text-red-600`).
- **Tables**: Clean rows, `border-b border-slate-100`, hover effect `hover:bg-slate-50`.

---

## 4. Implementation Rules (Do's & Don'ts)

| Do | Don't |
|----|-------|
| Use `gap-4` or `gap-6` for grids | Use `br` tags for spacing |
| Use `slate-500` for muted text | Use light gray that is unreadable |
| Use `cursor-pointer` on interactive cards | Leave default cursor on clickable items |
| Use `truncate` for long names | Let text overflow break layout |
| Use `IBM Plex Sans Arabic` | Use default sans-serif |

---

## 5. CSS Variables (Update `theme.css`)

```css
:root {
  --font-ibm: 'IBM Plex Sans Arabic', sans-serif;
  --primary: 220 38 38; /* #DC2626 */
  --secondary: 17 24 39; /* #111827 */
  /* ... */
}
```
