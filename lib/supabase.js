import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://znfsxpmmlxezzeasjtqa.supabase.co'
const supabaseKey = 'TU_ANON_KEY_AQUI'

export const supabase = createClient(supabaseUrl, supabaseKey)