/// A row from the office's student directory / one child's detail record.
///
/// Mirrors src/app/app/students/actions.ts::StudentInput plus the identity
/// fields (id, admissionNumber, class/section names, userId) that come back
/// from GET /students and GET /students/:id but are never sent up again — the
/// admission number in particular is deliberately immutable once issued (see
/// StudentFormScreen).
class Student {
  final String id;
  final String name;
  final String admissionNumber;
  final String classId;
  final String? className;
  final String? sectionId;
  final String? sectionName;
  final int? rollNumber;
  final String? dobIso;
  final String? gender;
  final String? fatherName;
  final String? motherName;
  final String? guardianPhone;
  final String? guardianEmail;
  final String? address;
  final String? category;
  final String? bloodGroup;
  final String? admissionDateIso;
  final String? userId;
  final String status;

  const Student({
    required this.id,
    required this.name,
    required this.admissionNumber,
    required this.classId,
    this.className,
    this.sectionId,
    this.sectionName,
    this.rollNumber,
    this.dobIso,
    this.gender,
    this.fatherName,
    this.motherName,
    this.guardianPhone,
    this.guardianEmail,
    this.address,
    this.category,
    this.bloodGroup,
    this.admissionDateIso,
    this.userId,
    required this.status,
  });

  /// True once this child has a login provisioned (see StudentLoginsScreen /
  /// the reset-login action) — a null userId means "reset login" has nothing
  /// to reset yet.
  bool get hasLogin => userId != null;

  factory Student.fromJson(Map<String, dynamic> json) {
    final cls = json['class'] as Map<String, dynamic>?;
    final section = json['section'] as Map<String, dynamic>?;
    return Student(
      id: json['id'] as String,
      name: json['name'] as String,
      admissionNumber: json['admissionNumber'] as String,
      classId: json['classId'] as String,
      className: cls?['name'] as String?,
      sectionId: json['sectionId'] as String?,
      sectionName: section?['name'] as String?,
      rollNumber: json['rollNumber'] as int?,
      dobIso: (json['dob'] as String?)?.substring(0, 10),
      gender: json['gender'] as String?,
      fatherName: json['fatherName'] as String?,
      motherName: json['motherName'] as String?,
      guardianPhone: json['guardianPhone'] as String?,
      guardianEmail: json['guardianEmail'] as String?,
      address: json['address'] as String?,
      category: json['category'] as String?,
      bloodGroup: json['bloodGroup'] as String?,
      admissionDateIso: (json['admissionDate'] as String?)?.substring(0, 10),
      userId: json['userId'] as String?,
      status: json['status'] as String? ?? 'ACTIVE',
    );
  }
}
