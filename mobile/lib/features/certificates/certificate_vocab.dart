/// Mirrors src/lib/core/certificate-core.ts — kept as plain Dart consts so
/// the issue form's dropdowns show exactly the same vocabulary the web app
/// and the mobile API's loose validation (studentId/type only) expect.
class CertificateTypeMeta {
  const CertificateTypeMeta({required this.value, required this.label, required this.short});

  final String value;
  final String label;
  final String short;
}

const kCertificateTypes = [
  CertificateTypeMeta(value: 'TRANSFER', label: 'Transfer Certificate', short: 'TC'),
  CertificateTypeMeta(value: 'BONAFIDE', label: 'Bonafide Certificate', short: 'Bonafide'),
  CertificateTypeMeta(value: 'CHARACTER', label: 'Character Certificate', short: 'Character'),
  CertificateTypeMeta(value: 'STUDY', label: 'Study Certificate', short: 'Study'),
  CertificateTypeMeta(value: 'CONDUCT', label: 'Conduct Certificate', short: 'Conduct'),
  CertificateTypeMeta(value: 'FEE_PAID', label: 'Fee Paid Certificate', short: 'Fee paid'),
];

CertificateTypeMeta certificateMeta(String type) =>
    kCertificateTypes.firstWhere((t) => t.value == type, orElse: () => kCertificateTypes.first);

const kConductOptions = ['Excellent', 'Very Good', 'Good', 'Satisfactory'];

const kLeavingReasons = [
  "Parent's transfer",
  'Shifting residence',
  "At parent's request",
  'Completed the highest class in this school',
  'Admission to another school',
  'Long absence',
];
