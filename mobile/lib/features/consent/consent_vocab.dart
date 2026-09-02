import '../../core/theme/app_theme.dart';

/// Mirrors src/lib/queries/compliance.ts::CONSENT_PURPOSES — kept in step so
/// a purpose typed here always matches one the mobile API's ConsentPurposeEnum
/// accepts.
class ConsentPurposeMeta {
  const ConsentPurposeMeta({required this.value, required this.label, required this.short});

  final String value;
  final String label;
  final String short;
}

const kConsentPurposes = [
  ConsentPurposeMeta(value: 'ENROLMENT_DATA', label: 'Enrolment data', short: 'Enrolment'),
  ConsentPurposeMeta(value: 'APAAR_GENERATION', label: 'APAAR generation', short: 'APAAR'),
  ConsentPurposeMeta(value: 'PHOTO_MEDIA', label: 'Photos & video', short: 'Photos'),
  ConsentPurposeMeta(value: 'COMMUNICATION', label: 'Communication', short: 'Comms'),
  ConsentPurposeMeta(value: 'HEALTH_RECORDS', label: 'Health records', short: 'Health'),
  ConsentPurposeMeta(value: 'THIRD_PARTY_SHARING', label: 'Third-party sharing', short: '3rd-party'),
];

ConsentPurposeMeta consentPurposeMeta(String value) =>
    kConsentPurposes.firstWhere((p) => p.value == value, orElse: () => kConsentPurposes.first);

/// Mirrors src/lib/core/consent-core.ts::VERIFICATION_METHODS — the DPDP Act
/// requires VERIFIABLE parental consent, so this is how it was verified, not
/// just a tick-box.
class VerificationMethodMeta {
  const VerificationMethodMeta({required this.value, required this.label});

  final String value;
  final String label;
}

const kVerificationMethods = [
  VerificationMethodMeta(value: 'OTP_PHONE', label: 'OTP to registered mobile'),
  VerificationMethodMeta(value: 'DIGILOCKER', label: 'DigiLocker identity'),
  VerificationMethodMeta(value: 'IN_PERSON_ID', label: 'In person, ID checked at the office'),
  VerificationMethodMeta(value: 'SIGNED_FORM', label: 'Signed paper form on file'),
];

/// Mirrors the Prisma `ConsentState` enum.
const kConsentStates = ['GRANTED', 'REFUSED', 'PENDING', 'WITHDRAWN'];

Tone toneForConsentState(String state) => switch (state) {
      'GRANTED' => Tone.good,
      'REFUSED' => Tone.bad,
      'PENDING' => Tone.warn,
      'WITHDRAWN' => Tone.neutral,
      _ => Tone.neutral,
    };
