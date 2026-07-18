import {
  credentialsFromRecord,
  parseCsv,
} from './csv-parser';

describe('csv-parser', () => {
  describe('parseCsv', () => {
    it('parses a simple three-column CSV into records', () => {
      const csv = 'platform,accountId,accountName\nWECHAT_OFFICIAL,wx1,Brand\nDOUYIN,dy1,MyDouyin';
      const { headers, rows, errors } = parseCsv(csv);
      expect(headers).toEqual(['platform', 'accountId', 'accountName']);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({
        platform: 'WECHAT_OFFICIAL',
        accountId: 'wx1',
        accountName: 'Brand',
      });
      expect(errors).toHaveLength(0);
    });

    it('trims whitespace around headers and values', () => {
      const csv = ' platform , accountId , accountName \n WECHAT_OFFICIAL , wx1 , Brand ';
      const { rows } = parseCsv(csv);
      expect(rows[0]).toEqual({
        platform: 'WECHAT_OFFICIAL',
        accountId: 'wx1',
        accountName: 'Brand',
      });
    });

    it('handles quoted fields with embedded commas', () => {
      const csv = 'platform,accountId,accountName\nWECHAT_OFFICIAL,wx1,"Brand, Official"';
      const { rows } = parseCsv(csv);
      expect(rows[0].accountName).toBe('Brand, Official');
    });

    it('handles quoted fields with escaped double-quotes', () => {
      const csv = 'platform,accountId,accountName\nWECHAT_OFFICIAL,wx1,"The ""Best"" Brand"';
      const { rows } = parseCsv(csv);
      expect(rows[0].accountName).toBe('The "Best" Brand');
    });

    it('handles quoted fields with embedded newlines', () => {
      const csv = 'platform,accountId,accountName\nWECHAT_OFFICIAL,wx1,"Line One\nLine Two"';
      const { rows } = parseCsv(csv);
      expect(rows[0].accountName).toBe('Line One\nLine Two');
    });

    it('tolerates both CRLF and LF line endings', () => {
      const csv = 'platform,accountId\r\nWECHAT_OFFICIAL,wx1\r\nDOUYIN,dy1';
      const { rows } = parseCsv(csv);
      expect(rows).toHaveLength(2);
    });

    it('flags ragged rows as parse errors and skips them', () => {
      const csv = 'platform,accountId,accountName\nWECHAT_OFFICIAL,wx1\nDOUYIN,dy1,Douyin';
      const { rows, errors } = parseCsv(csv);
      expect(rows).toHaveLength(1);
      expect(rows[0].accountId).toBe('dy1');
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({ line: 1, reason: /column count mismatch/ });
    });

    it('ignores empty lines between data rows', () => {
      const csv = 'platform,accountId\nWECHAT_OFFICIAL,wx1\n\nDOUYIN,dy1\n';
      const { rows } = parseCsv(csv);
      expect(rows).toHaveLength(2);
    });

    it('returns empty result for an empty input', () => {
      const { headers, rows, errors } = parseCsv('');
      expect(headers).toEqual([]);
      expect(rows).toHaveLength(0);
      expect(errors).toHaveLength(0);
    });
  });

  describe('credentialsFromRecord', () => {
    it('picks out per-column credential keys and drops empty strings', () => {
      const rec = {
        platform: 'WECHAT_OFFICIAL',
        appid: 'myappid',
        secret: 'mysecret',
        rawId: '',
      };
      const creds = credentialsFromRecord('WECHAT_OFFICIAL', rec);
      expect(creds).toEqual({ appid: 'myappid', secret: 'mysecret' });
    });

    it('parses a `credentials` JSON string column into keys', () => {
      const rec = {
        platform: 'DOUYIN',
        clientKey: 'ck',
        credentials: '{"clientSecret":"cs","callbackUrl":"https://cb"}',
      };
      const creds = credentialsFromRecord('DOUYIN', rec);
      expect(creds).toMatchObject({
        clientKey: 'ck',
        clientSecret: 'cs',
        callbackUrl: 'https://cb',
      });
    });

    it('does not throw on a malformed `credentials` column', () => {
      const rec = { platform: 'XIAOHONGSHU', credentials: '{not json' };
      const creds = credentialsFromRecord('XIAOHONGSHU', rec);
      expect(creds).toEqual({});
    });
  });
});
