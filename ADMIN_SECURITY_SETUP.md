# Admin Panel Server-Side Authorization Setup

## Current Security Vulnerability

**CRITICAL:** The admin panel currently only checks `profile.role === 'admin'` on the client side ([AdminPanel.jsx:115](src/AdminPanel.jsx#L115)). This is extremely insecure because:

1. Anyone can open browser DevTools
2. Modify the `profile.role` value to `'admin'`
3. Gain full admin access to:
   - Modify any player's currencies, XP, and ratings
   - Unlock all characters for any account
   - Create/edit/delete missions, banners, and shop offers
   - Modify character stats and abilities
   - Delete game data

## Solution: Supabase Row Level Security (RLS)

Supabase allows you to define security policies at the database level that cannot be bypassed from the client.

### Step 1: Enable RLS on All Admin Tables

Run these SQL commands in your Supabase SQL Editor (Dashboard → SQL Editor):

```sql
-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE character_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE character_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE banner_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_offers ENABLE ROW LEVEL SECURITY;
```

### Step 2: Create Admin Check Function

Create a helper function to check if the current user is an admin:

```sql
-- Create helper function to check if current user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Step 3: Create RLS Policies for Each Table

#### **Profiles Table**

```sql
-- Players can view their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Players can update their own profile (except role and currencies)
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT role FROM profiles WHERE id = auth.uid()) -- Prevent role escalation
    AND soft_currency = (SELECT soft_currency FROM profiles WHERE id = auth.uid()) -- Prevent currency manipulation
    AND premium_currency = (SELECT premium_currency FROM profiles WHERE id = auth.uid())
  );

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (is_admin());

-- Admins can update any profile
CREATE POLICY "Admins can update profiles"
  ON profiles FOR UPDATE
  USING (is_admin());

-- Allow new user creation during signup
CREATE POLICY "Allow profile creation on signup"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);
```

#### **Character Progress**

```sql
-- Players can view their own character progress
CREATE POLICY "Users can view own character progress"
  ON character_progress FOR SELECT
  USING (auth.uid() = user_id);

-- Players can update their own character progress
CREATE POLICY "Users can update own character progress"
  ON character_progress FOR UPDATE
  USING (auth.uid() = user_id);

-- Players can insert their own character progress
CREATE POLICY "Users can insert own character progress"
  ON character_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admins can do anything
CREATE POLICY "Admins can manage all character progress"
  ON character_progress FOR ALL
  USING (is_admin());
```

#### **User Inventory**

```sql
-- Players can view their own inventory
CREATE POLICY "Users can view own inventory"
  ON user_inventory FOR SELECT
  USING (auth.uid() = user_id);

-- Players can update their own inventory (with constraints)
CREATE POLICY "Users can update own inventory"
  ON user_inventory FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own inventory"
  ON user_inventory FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admins can do anything
CREATE POLICY "Admins can manage all inventory"
  ON user_inventory FOR ALL
  USING (is_admin());
```

#### **Read-Only Tables (Characters, Skills)**

```sql
-- Everyone can read characters
CREATE POLICY "Anyone can view characters"
  ON characters FOR SELECT
  USING (true);

-- Only admins can modify characters
CREATE POLICY "Admins can manage characters"
  ON characters FOR ALL
  USING (is_admin());

-- Everyone can read character skills
CREATE POLICY "Anyone can view character skills"
  ON character_skills FOR SELECT
  USING (true);

-- Only admins can modify skills
CREATE POLICY "Admins can manage character skills"
  ON character_skills FOR ALL
  USING (is_admin());
```

#### **Game Content Tables (Missions, Banners, Shop)**

```sql
-- Everyone can read missions
CREATE POLICY "Anyone can view missions"
  ON missions FOR SELECT
  USING (true);

-- Only admins can manage missions
CREATE POLICY "Admins can manage missions"
  ON missions FOR ALL
  USING (is_admin());

-- Everyone can read banners
CREATE POLICY "Anyone can view banners"
  ON banners FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage banners"
  ON banners FOR ALL
  USING (is_admin());

-- Everyone can read banner items
CREATE POLICY "Anyone can view banner items"
  ON banner_items FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage banner items"
  ON banner_items FOR ALL
  USING (is_admin());

-- Everyone can read shop offers
CREATE POLICY "Anyone can view shop offers"
  ON shop_offers FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage shop offers"
  ON shop_offers FOR ALL
  USING (is_admin());
```

### Step 4: Test the Security

After implementing RLS policies, test that:

1. **Non-admin users cannot modify admin data:**
   ```javascript
   // This should fail with "new row violates row-level security policy"
   const { error } = await supabase
     .from('profiles')
     .update({ soft_currency: 999999 })
     .eq('id', someOtherUserId);
   ```

2. **Users cannot escalate their own role:**
   ```javascript
   // This should fail
   const { error } = await supabase
     .from('profiles')
     .update({ role: 'admin' })
     .eq('id', auth.uid());
   ```

3. **Admin operations work correctly:**
   - Login as an admin
   - Try modifying another user's profile
   - Should succeed

### Step 5: Update Client-Side Code

The client-side code in [AdminPanel.jsx](src/AdminPanel.jsx) can stay mostly the same, but you should add proper error handling to show when operations fail due to insufficient permissions.

Add error handling to all admin operations:

```javascript
const handleProfileSave = async () => {
  if (!profileDraft) return
  const payload = {
    role: profileDraft.role,
    account_xp: Number(profileDraft.account_xp) || 0,
    account_level: Number(profileDraft.account_level) || 1,
    rating: Number(profileDraft.rating) || 0,
    soft_currency: Number(profileDraft.soft_currency) || 0,
    premium_currency: Number(profileDraft.premium_currency) || 0,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(payload)
    .eq('id', profileDraft.id)

  if (error) {
    // Show error to user
    alert(`Failed to save profile: ${error.message}`)
    console.error('Profile save error:', error)
    return
  }

  setProfiles(prev =>
    prev.map(item => (item.id === profileDraft.id ? { ...item, ...payload } : item))
  )
}
```

### Step 6: Set Your First Admin

You need to manually set your first admin user in the Supabase dashboard:

1. Go to Supabase Dashboard → Table Editor
2. Open the `profiles` table
3. Find your user's row (by email/ID)
4. Change the `role` column from `player` to `admin`
5. Save

### Step 7: Verify Security

1. Open browser DevTools
2. Try to modify your profile role in the console:
   ```javascript
   await supabase.from('profiles').update({ role: 'admin' }).eq('id', 'your-user-id')
   ```
3. Should see error: `new row violates row-level security policy for table "profiles"`

## Additional Security Recommendations

### 1. Add Audit Logging

Track all admin actions:

```sql
CREATE TABLE admin_audit_log (
  id BIGSERIAL PRIMARY KEY,
  admin_id UUID REFERENCES profiles(id),
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id TEXT,
  old_values JSONB,
  new_values JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2. Add Rate Limiting

Prevent admins from making too many changes too quickly (prevent accidents or compromised accounts):

```sql
-- Create function to check rate limit
CREATE OR REPLACE FUNCTION check_admin_rate_limit()
RETURNS BOOLEAN AS $$
BEGIN
  -- Allow max 100 admin operations per minute
  RETURN (
    SELECT COUNT(*) FROM admin_audit_log
    WHERE admin_id = auth.uid()
    AND created_at > NOW() - INTERVAL '1 minute'
  ) < 100;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 3. Require Multi-Factor Authentication for Admins

In Supabase Dashboard:
- Go to Authentication → Settings
- Enable Multi-Factor Authentication
- Require it for admin accounts

### 4. Separate Admin Database Access

For highly sensitive operations, consider using Supabase Edge Functions with service role keys that never touch the client.

## Implementation Checklist

- [ ] Run all RLS enablement commands
- [ ] Create `is_admin()` helper function
- [ ] Create all RLS policies for each table
- [ ] Set your first admin user manually in Supabase dashboard
- [ ] Test that non-admin users can't escalate privileges
- [ ] Test that non-admin users can't modify other users' data
- [ ] Add error handling to all admin operations in AdminPanel.jsx
- [ ] Test admin operations work correctly for actual admin users
- [ ] (Optional) Add audit logging
- [ ] (Optional) Add rate limiting
- [ ] (Optional) Enable MFA for admin accounts

## Verification Commands

Run these in Supabase SQL Editor to verify policies are active:

```sql
-- Check which tables have RLS enabled
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- List all policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

---

**Timeline: Implement these security measures before any public release or within 48 hours if already public.**
