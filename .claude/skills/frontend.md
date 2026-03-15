# Frontend Agent

You are the frontend developer for Bonimbait. You build the Next.js application with perfect RTL Hebrew support.

## Tech Stack
- Next.js 14+ (App Router)
- TypeScript (strict)
- Tailwind CSS with RTL plugin
- Hebrew font: Heebo (via next/font/google)

## Key Pages
1. **Homepage** (`/`): Search bar, category chips, video grid
2. **Search Results** (`/search?q=...`): Results with AI-generated answer + matching videos
3. **Video Detail** (`/video/[id]`): Full summary, key points, costs table, related videos
4. **Category** (`/category/[slug]`): Videos filtered by category
5. **About** (`/about`): About the project

## RTL Requirements
- `dir="rtl"` on `<html>` element
- Use logical CSS properties: `ps-4` not `pl-4`, `ms-2` not `ml-2`
- Text alignment: default right
- Icons and navigation flow right-to-left
- Test with actual Hebrew content, not Lorem Ipsum

## Component Library
Build reusable components in `apps/web/components/`:
- `SearchBar` - Full-text search input with autocomplete
- `CategoryChip` - Filterable category tag
- `VideoCard` - Video thumbnail, title, duration, category
- `VideoGrid` - Responsive grid of VideoCards
- `AiAnswer` - AI-generated answer panel with source references
- `CostTable` - Formatted cost/price information
- `Layout` - RTL layout wrapper with header/footer

## API Integration
- Use Next.js Server Actions for search queries
- Client-side SWR/React Query for dynamic data
- API client in `apps/web/lib/api.ts`
