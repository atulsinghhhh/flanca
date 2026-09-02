/// Mirrors src/lib/core/money.ts::formatMoney — money is always an integer
/// number of paise; Indian digit grouping, no decimals when whole.
String formatMoney(int paise, {bool withSymbol = true}) {
  final negative = paise < 0;
  final abs = paise.abs();
  final whole = abs ~/ 100;
  final fraction = abs % 100;

  final grouped = _groupIndian(whole);
  final body = fraction == 0 ? grouped : '$grouped.${fraction.toString().padLeft(2, '0')}';

  return '${negative ? '−' : ''}${withSymbol ? '₹' : ''}$body';
}

/// Indian grouping: last three digits, then pairs. 1234567 -> 12,34,567
String _groupIndian(int n) {
  final s = n.toString();
  if (s.length <= 3) return s;
  final last3 = s.substring(s.length - 3);
  var rest = s.substring(0, s.length - 3);
  final buffer = StringBuffer();
  for (var i = 0; i < rest.length; i++) {
    final remaining = rest.length - i;
    if (i > 0 && remaining % 2 == 0) buffer.write(',');
    buffer.write(rest[i]);
  }
  return '${buffer.toString()},$last3';
}

/// A calendar-day string ("2026-08-31") formatted as "31 Aug 2026".
String formatDay(String isoOrDateTime) {
  final date = DateTime.parse(isoOrDateTime);
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return '${date.day} ${months[date.month - 1]} ${date.year}';
}
