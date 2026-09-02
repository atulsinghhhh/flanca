import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:razorpay_flutter/razorpay_flutter.dart';

import '../../core/auth/auth_state.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
import '../../core/widgets/app_widgets.dart';

/// One invoice, paid in-app: create a Razorpay order for exactly what's
/// outstanding (server-computed, never trusted from here), let Checkout
/// collect card/UPI/netbanking, then hand what it returns to the confirm
/// endpoint — the step that actually verifies the signature and only then
/// settles the invoice (src/lib/mobile/mutations/payments.ts). Nothing here
/// touches the invoice directly; a cancelled or failed Checkout leaves the
/// balance exactly as it was.
class PayNowButton extends ConsumerStatefulWidget {
  const PayNowButton({
    super.key,
    required this.studentId,
    required this.invoiceId,
    required this.amount,
    required this.onPaid,
  });

  final String studentId;
  final String invoiceId;
  final int amount;
  final VoidCallback onPaid;

  @override
  ConsumerState<PayNowButton> createState() => _PayNowButtonState();
}

class _PayNowButtonState extends ConsumerState<PayNowButton> {
  late final Razorpay _razorpay;
  String? _paymentOrderId;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _razorpay = Razorpay();
    _razorpay.on(Razorpay.EVENT_PAYMENT_SUCCESS, _onSuccess);
    _razorpay.on(Razorpay.EVENT_PAYMENT_ERROR, _onError);
    _razorpay.on(Razorpay.EVENT_EXTERNAL_WALLET, _onExternalWallet);
  }

  @override
  void dispose() {
    _razorpay.clear();
    super.dispose();
  }

  Future<void> _startPayment() async {
    setState(() => _busy = true);
    try {
      final api = ref.read(apiClientProvider);
      final order = await api.post<Map<String, dynamic>>('/fees/payment-orders', data: {
        'studentId': widget.studentId,
        'invoiceId': widget.invoiceId,
      });

      _paymentOrderId = order['paymentOrderId'] as String;

      _razorpay.open({
        'key': order['keyId'],
        'order_id': order['razorpayOrderId'],
        'amount': order['amount'],
        'currency': order['currency'],
        'name': order['schoolName'],
        'description': 'School fees',
        'prefill': {'name': order['studentName']},
        'theme': {'color': '#17795E'},
      });
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
    // On a real device flow control returns here immediately once Checkout
    // opens — _busy comes back down inside the event handlers below, not here.
  }

  Future<void> _onSuccess(PaymentSuccessResponse response) async {
    final paymentOrderId = _paymentOrderId;
    if (paymentOrderId == null) return;

    try {
      final api = ref.read(apiClientProvider);
      await api.post<Map<String, dynamic>>('/fees/payment-orders/$paymentOrderId/confirm', data: {
        'razorpayOrderId': response.orderId,
        'razorpayPaymentId': response.paymentId,
        'razorpaySignature': response.signature,
      });

      widget.onPaid();
      if (mounted) {
        await showDialog<void>(
          context: context,
          builder: (_) => AlertDialog(
            title: const Text('Payment received'),
            content: Text('${formatMoney(widget.amount)} has been recorded and a receipt issued.'),
            actions: [
              FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Done')),
            ],
          ),
        );
      }
    } on ApiException catch (e) {
      // Money has actually moved at the gateway at this point — a failure to
      // confirm here is a support case, not a "try again", so it says so.
      if (mounted) {
        await showDialog<void>(
          context: context,
          builder: (_) => AlertDialog(
            title: const Text('Payment could not be confirmed'),
            content: Text(
              '${e.message}\n\nIf the payment was actually deducted, contact the school office with '
              'the payment reference ${response.paymentId} — do not pay again.',
            ),
            actions: [FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('OK'))],
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _onError(PaymentFailureResponse response) {
    if (!mounted) return;
    setState(() => _busy = false);
    // Nothing to confirm server-side: no signature exists for a payment that
    // never completed, and the PaymentOrder is simply left CREATED.
    if (response.code == Razorpay.PAYMENT_CANCELLED) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(response.message ?? 'The payment did not go through.')),
    );
  }

  void _onExternalWallet(ExternalWalletResponse response) {
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: AppSubmitButton(
        label: 'Pay ${formatMoney(widget.amount)} now',
        icon: Icons.bolt_rounded,
        busy: _busy,
        onPressed: _busy ? null : _startPayment,
      ),
    );
  }
}
