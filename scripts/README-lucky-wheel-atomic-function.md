# Lucky Wheel Atomic Spin Function

## Problem
Previously, there was a race condition where multiple users could spin the lucky wheel simultaneously, causing the global spin count to exceed the limit of 25. For example, if 24/25 spins were used, two users could both pass the limit check and both increment, resulting in 26/25 spins.

## Solution
Multiple PostgreSQL functions were created that use advisory locks to ensure atomicity and prevent payment without spin:

1. **`reserve_lucky_wheel_spin`** - Reserves a spin slot by checking the limit and incrementing atomically
2. **`confirm_lucky_wheel_spin`** - Confirms a reserved spin after successful payment (returns reward)
3. **`cancel_lucky_wheel_spin`** - Cancels a reserved spin if payment fails (decrements count)
4. **`try_increment_lucky_wheel_spin`** - Legacy function for backward compatibility

The new flow:
1. **Reserve** - Check limit and reserve slot (increment count)
2. **Payment** - Process payment (only if reservation succeeded)
3. **Confirm** - Confirm spin and get reward (if payment succeeded)
4. **Cancel** - Cancel reservation if payment failed (decrement count)

This ensures:
- Users can't pay if the limit is reached (payment happens AFTER reservation check)
- Only one spin can be processed at a time for each date (advisory locks)
- Failed payments don't consume spin slots (cancel function reverses reservation)

## Deployment

1. Connect to your Supabase database (via Supabase Dashboard > SQL Editor, or using psql)

2. Run the SQL script:
   ```sql
   -- Execute the contents of create-lucky-wheel-atomic-function.sql
   ```

3. Grant execute permissions (if needed, based on your RLS policies):
   ```sql
   GRANT EXECUTE ON FUNCTION try_increment_lucky_wheel_spin TO authenticated;
   GRANT EXECUTE ON FUNCTION try_increment_lucky_wheel_spin TO anon;
   ```

4. Verify the function exists:
   ```sql
   SELECT proname FROM pg_proc WHERE proname = 'try_increment_lucky_wheel_spin';
   ```

## How It Works

The function uses PostgreSQL advisory locks (`pg_advisory_xact_lock`) which are automatically released when the transaction commits or rolls back. This ensures that:

- Only one transaction can process spins for a given date at a time
- The check and increment happen atomically
- If the limit is reached, subsequent requests are properly rejected
- No race conditions can occur

## Testing

After deployment, test by:
1. Having multiple users attempt to spin simultaneously
2. Verify that the global count never exceeds 25
3. Verify that when 25/25 is reached, additional spins are properly rejected

