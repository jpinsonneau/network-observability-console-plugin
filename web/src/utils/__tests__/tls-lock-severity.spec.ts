import { aggregateTlsLockSeverity, classifyTlsVersionString, mergeTlsLockSeverities } from '../tls-lock-severity';

describe('classifyTlsVersionString', () => {
  it('should classify TLS 1.0 / 1.1 as deprecated', () => {
    expect(classifyTlsVersionString('TLS 1.0')).toBe('deprecated');
    expect(classifyTlsVersionString('TLSv1.1')).toBe('deprecated');
  });

  it('should classify TLS 1.2 as legacy', () => {
    expect(classifyTlsVersionString('TLS 1.2')).toBe('legacy');
    expect(classifyTlsVersionString('TLSv1.2')).toBe('legacy');
  });

  it('should classify TLS 1.3 as modern', () => {
    expect(classifyTlsVersionString('TLS 1.3')).toBe('modern');
    expect(classifyTlsVersionString('TLSv1.3')).toBe('modern');
  });

  it('should classify SSL as deprecated', () => {
    expect(classifyTlsVersionString('SSLv3')).toBe('deprecated');
  });
});

describe('aggregateTlsLockSeverity', () => {
  it('should pick worst among versions', () => {
    expect(aggregateTlsLockSeverity(['TLS 1.3', 'TLS 1.2'])).toBe('legacy');
    expect(aggregateTlsLockSeverity(['TLS 1.3', 'TLS 1.0'])).toBe('deprecated');
  });
});

describe('mergeTlsLockSeverities', () => {
  it('should merge with worst winning', () => {
    expect(mergeTlsLockSeverities('modern', 'deprecated')).toBe('deprecated');
    expect(mergeTlsLockSeverities('legacy', undefined)).toBe('legacy');
  });
});
