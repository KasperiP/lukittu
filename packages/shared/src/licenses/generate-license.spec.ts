// import { generateHMAC } from '@lukittu/shared';

// jest.mock('../security/crypto', () => ({
//   __esModule: true,
//   generateHMAC: jest.fn(),
// }));

// describe('License Generation', () => {
//   const teamId = 'team-123';

//   beforeEach(() => {
//     jest.clearAllMocks();
//     (generateHMAC as jest.Mock).mockReturnValue('mocked-hmac');
//     prismaMock.license.findUnique.mockReset();
//   });

//   describe('generateUniqueLicense', () => {
//     it('should generate a valid license key on first attempt if no collision', async () => {
//       prismaMock.license.findUnique.mockResolvedValue(null);

//       const result = await generateUniqueLicense(teamId);

//       expect(result).not.toBeNull();
//       expect(result).toMatch(regex.licenseKey);
//       expect(prismaMock.license.findUnique).toHaveBeenCalledTimes(1);
//       expect(generateHMAC).toHaveBeenCalledTimes(1);
//       expect(generateHMAC).toHaveBeenCalledWith(
//         expect.stringMatching(/.*:team-123$/),
//       );
//     });

//     it('should retry up to MAX_ATTEMPTS times on collision', async () => {
//       prismaMock.license.findUnique
//         .mockResolvedValueOnce({ id: 'existing-1' } as any)
//         .mockResolvedValueOnce({ id: 'existing-2' } as any)
//         .mockResolvedValueOnce({ id: 'existing-3' } as any)
//         .mockResolvedValueOnce({ id: 'existing-4' } as any)
//         .mockResolvedValueOnce(null);

//       const result = await generateUniqueLicense(teamId);

//       expect(result).not.toBeNull();
//       expect(result).toMatch(regex.licenseKey);
//       expect(prismaMock.license.findUnique).toHaveBeenCalledTimes(5);
//       expect(generateHMAC).toHaveBeenCalledTimes(5);
//     });

//     it('should return null after MAX_ATTEMPTS failed attempts', async () => {
//       prismaMock.license.findUnique.mockResolvedValue({
//         id: 'existing',
//       } as any);

//       const result = await generateUniqueLicense(teamId);

//       expect(result).toBeNull();
//       expect(prismaMock.license.findUnique).toHaveBeenCalledTimes(5);
//       expect(generateHMAC).toHaveBeenCalledTimes(5);
//     });

//     it('should generate license keys in correct format', async () => {
//       prismaMock.license.findUnique.mockResolvedValue(null);

//       const result = await generateUniqueLicense(teamId);

//       expect(result).toMatch(regex.licenseKey);
//     });

//     it('should properly handle database errors', async () => {
//       prismaMock.license.findUnique.mockRejectedValue(
//         new Error('Database error'),
//       );

//       await expect(generateUniqueLicense(teamId)).rejects.toThrow(
//         'Database error',
//       );
//       expect(prismaMock.license.findUnique).toHaveBeenCalledTimes(1);
//     });

//     it('should call generateHMAC with correct parameters', async () => {
//       prismaMock.license.findUnique.mockResolvedValue(null);

//       const result = await generateUniqueLicense(teamId);

//       expect(generateHMAC).toHaveBeenCalledTimes(1);
//       expect(generateHMAC).toHaveBeenCalledWith(
//         expect.stringMatching(new RegExp(`^.*:${teamId}$`)),
//       );
//       expect(result).not.toBeNull();
//     });
//   });

//   describe('License key format', () => {
//     it('should generate license keys of correct length', async () => {
//       prismaMock.license.findUnique.mockResolvedValue(null);

//       const result = await generateUniqueLicense(teamId);

//       expect(result?.replace(/-/g, '').length).toBe(25);
//     });

//     it('should only contain valid characters', async () => {
//       prismaMock.license.findUnique.mockResolvedValue(null);

//       const result = await generateUniqueLicense(teamId);

//       expect(result).toMatch(/^[A-Z0-9-]+$/);
//     });
//   });
// });
