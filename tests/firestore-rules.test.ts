import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Firestore Security Rules Static Integrity', () => {
  const rulesPath = path.resolve(__dirname, '../firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');

  it('strictly disallows direct client-side order creation', () => {
    // Finds the orders match block
    const ordersMatch = rulesContent.match(/match\s+\/orders\/\{orderId\}[\s\S]*?\n\s*\}/);
    expect(ordersMatch).toBeDefined();
    const ordersBlock = ordersMatch![0];

    // Verify create is false
    expect(ordersBlock).toMatch(/allow\s+create:\s*if\s+false\s*;/);

    // Ensure former permissive check (total > 0) is completely removed
    expect(ordersBlock).not.toContain('request.resource.data.total > 0');
  });

  it('strictly isolates idempotency records from client access', () => {
    const idempMatch = rulesContent.match(/match\s+\/idempotency_records\/\{recordId\}[\s\S]*?\n\s*\}/);
    expect(idempMatch).toBeDefined();
    const idempBlock = idempMatch![0];

    expect(idempBlock).toMatch(/allow\s+read,\s*write:\s*if\s+false\s*;/);
  });

  it('prevents order deletion to maintain audit trails', () => {
    const ordersMatch = rulesContent.match(/match\s+\/orders\/\{orderId\}[\s\S]*?\n\s*\}/);
    expect(ordersMatch).toBeDefined();
    expect(ordersMatch![0]).toMatch(/allow\s+delete:\s*if\s+false\s*;/);
  });

  it('restricts order updates to staff and admins only', () => {
    const ordersMatch = rulesContent.match(/match\s+\/orders\/\{orderId\}[\s\S]*?\n\s*\}/);
    expect(ordersMatch).toBeDefined();
    expect(ordersMatch![0]).toMatch(/allow\s+update:\s*if\s+isStaff\(\)\s*;/);
  });

  it('protects admin and user profile collections from unauthorized modification', () => {
    const adminsMatch = rulesContent.match(/match\s+\/admins\/\{adminId\}[\s\S]*?\n\s*\}/);
    expect(adminsMatch).toBeDefined();
    expect(adminsMatch![0]).toMatch(/allow\s+write:\s*if\s+isAdmin\(\)\s*;/);

    const profilesMatch = rulesContent.match(/match\s+\/user_profiles\/\{userId\}[\s\S]*?\n\s*\}/);
    expect(profilesMatch).toBeDefined();
    expect(profilesMatch![0]).toMatch(/allow\s+delete:\s*if\s+false\s*;/);
  });

  it('enforces email verification or server claims on admin privileges', () => {
    const isAdminFunc = rulesContent.match(/function\s+isAdmin\(\)[\s\S]*?\n\s*\}/);
    expect(isAdminFunc).toBeDefined();
    const funcBlock = isAdminFunc![0];

    expect(funcBlock).toContain('request.auth.token.role ==');
    expect(funcBlock).toContain('email_verified == true');
  });

  it('restricts business_rules modification strictly to administrators while allowing public read', () => {
    const bizMatch = rulesContent.match(/match\s+\/business_rules\/\{ruleId\}[\s\S]*?\n\s*\}/);
    expect(bizMatch).toBeDefined();
    const bizBlock = bizMatch![0];

    expect(bizBlock).toMatch(/allow\s+read:\s*if\s+true\s*;/);
    expect(bizBlock).toMatch(/allow\s+write:\s*if\s+isAdmin\(\)\s*;/);
  });
});
