import { accessibleHomeFilter, accessibleHomeWhere, assertOwner } from './home-access';
import { ApiError } from '../common/errors/api-error';

describe('home-access', () => {
  it('mencakup rumah milik user dan rumah yang dianggotainya', () => {
    expect(accessibleHomeFilter('usr_1')).toEqual({
      OR: [
        { ownerId: 'usr_1' },
        { members: { some: { userId: 'usr_1' } } },
      ],
    });
  });

  it('membatasi ke homeId tertentu tanpa kehilangan cek keanggotaan', () => {
    const where = accessibleHomeWhere('usr_1', 'home_9');

    expect(where).toEqual({
      OR: [
        { ownerId: 'usr_1' },
        { members: { some: { userId: 'usr_1' } } },
      ],
      id: 'home_9',
    });
  });

  it('tanpa homeId tidak menambah filter id', () => {
    expect(accessibleHomeWhere('usr_1')).not.toHaveProperty('id');
  });

  it('assertOwner menolak non-pemilik dengan 404, bukan 403', () => {
    // 403 akan mengonfirmasi keberadaan rumah milik orang lain.
    expect(() => assertOwner(false, 'home_1')).toThrow(ApiError);
    try {
      assertOwner(false, 'home_1');
    } catch (error) {
      expect((error as ApiError).code).toBe('NOT_FOUND');
      expect((error as ApiError).getStatus()).toBe(404);
    }
  });

  it('assertOwner membiarkan pemilik lewat', () => {
    expect(() => assertOwner(true, 'home_1')).not.toThrow();
  });
});
