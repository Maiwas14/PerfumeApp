-- Create the table to store the collections
create table user_collections (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  photo_url text,
  ai_data jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security
alter table user_collections enable row level security;

-- Create policies
create policy "Select Own" on user_collections for select using (auth.uid() = user_id);
create policy "Insert Own" on user_collections for insert with check (auth.uid() = user_id);

-- Instructions for Storage:
-- 1. Create a public bucket named 'perfume_gallery'.
-- 2. Add policy to allow authenticated users to upload/select.
