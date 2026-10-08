import 'package:flutter/material.dart';

import '../../online/account_service.dart';
import '../theme.dart';
import 'tv.dart';

enum EntryMode { choose, guest, login, register, forgot }

/// A porta de entrada: jogar como convidado, entrar com login ou criar
/// conta. Logado, mostra a conta (email, confirmação e sair).
///
/// Sem [onGuestName] a opção de convidado não aparece (quem já está
/// jogando como convidado só quer entrar ou criar conta).
Future<void> showEntrySheet(
  BuildContext context, {
  required AccountService account,
  String guestName = '',
  ValueChanged<String>? onGuestName,
  EntryMode start = EntryMode.choose,
}) => showModalBottomSheet<void>(
  context: context,
  isScrollControlled: true,
  showDragHandle: true,
  builder: (_) => ListenableBuilder(
    listenable: account,
    builder: (context, _) => account.isLoggedIn
        ? _AccountView(account: account)
        : _EntrySheet(
            account: account,
            guestName: guestName,
            onGuestName: onGuestName,
            start: start,
          ),
  ),
);

/// Entrar ou criar conta, sem a opção de convidado.
Future<void> showAccountSheet(BuildContext context, AccountService account) =>
    showEntrySheet(context, account: account);

class _EntrySheet extends StatefulWidget {
  const _EntrySheet({
    required this.account,
    required this.guestName,
    required this.onGuestName,
    required this.start,
  });
  final AccountService account;
  final String guestName;
  final ValueChanged<String>? onGuestName;
  final EntryMode start;

  @override
  State<_EntrySheet> createState() => _EntrySheetState();
}

class _EntrySheetState extends State<_EntrySheet> {
  late EntryMode _mode = widget.start;
  late final _name = TextEditingController(text: widget.guestName);
  final _user = TextEditingController();
  final _email = TextEditingController();
  final _pass = TextEditingController();
  String? _error;

  /// Mensagem de sucesso no "esqueci a senha".
  String? _sent;

  @override
  void dispose() {
    _name.dispose();
    _user.dispose();
    _email.dispose();
    _pass.dispose();
    super.dispose();
  }

  void _go(EntryMode m) => setState(() {
    if (m == EntryMode.forgot && _user.text.contains('@')) {
      _email.text = _user.text.trim();
    }
    _mode = m;
    _error = null;
    _sent = null;
  });

  void _guest() {
    final n = _name.text.trim();
    if (n.isEmpty) {
      setState(() => _error = 'Diga como os rivais vão te chamar.');
      return;
    }
    widget.onGuestName?.call(n);
    Navigator.of(context).pop();
  }

  Future<void> _submit() async {
    final a = widget.account;
    switch (_mode) {
      case EntryMode.login:
        final r = await a.login(_user.text, _pass.text);
        if (!mounted) return;
        if (!r.ok) setState(() => _error = r.message ?? 'Não deu certo.');
      case EntryMode.register:
        final r = await a.register(_user.text, _email.text, _pass.text);
        if (!mounted) return;
        if (r.ok) {
          ScaffoldMessenger.maybeOf(context)?.showSnackBar(
            SnackBar(
              content: Text(
                'Conta criada. Mandamos um link de confirmação para '
                '${_email.text.trim()}.',
              ),
            ),
          );
        } else {
          setState(() => _error = r.message ?? 'Não deu certo.');
        }
      case EntryMode.forgot:
        final r = await a.forgotPassword(_email.text);
        if (!mounted) return;
        setState(() {
          _error = r.ok ? null : (r.message ?? 'Não deu certo.');
          _sent = r.ok
              ? 'Se existir uma conta com esse email, o link para criar '
                    'uma senha nova chega em alguns minutos.'
              : null;
        });
      case EntryMode.guest:
        _guest();
      case EntryMode.choose:
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
          child: AnimatedSize(
            duration: const Duration(milliseconds: 180),
            alignment: Alignment.topCenter,
            child: Column(
              key: ValueKey(_mode),
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: switch (_mode) {
                EntryMode.choose => _choose(),
                EntryMode.guest => _guestForm(),
                EntryMode.login => _loginForm(),
                EntryMode.register => _registerForm(),
                EntryMode.forgot => _forgotForm(),
              },
            ),
          ),
        ),
      ),
    );
  }

  List<Widget> _choose() => [
    Text('Entrar.', style: TvType.title(40)),
    const SizedBox(height: 4),
    const _Lead('Escolha como sentar na mesa.'),
    const SizedBox(height: 20),
    CueButton(label: 'Entrar com login', onPressed: () => _go(EntryMode.login)),
    const SizedBox(height: 12),
    CueButton(
      label: 'Criar conta',
      quiet: true,
      onPressed: () => _go(EntryMode.register),
    ),
    if (widget.onGuestName != null) ...[
      const SizedBox(height: 8),
      CreditLine(
        title: 'Jogar como convidado',
        size: 20,
        credit: 'Só um nome. Sem amigos e sem convites online.',
        onTap: () => _go(EntryMode.guest),
        trailing: const Icon(Icons.chevron_right, color: Tv.creditMuted),
      ),
    ],
  ];

  List<Widget> _guestForm() => [
    _Back(onTap: () => _go(EntryMode.choose)),
    Text('Convidado.', style: TvType.title(36)),
    const SizedBox(height: 4),
    const _Lead('Dá para criar conta depois, quando quiser.'),
    const SizedBox(height: 20),
    TextField(
      controller: _name,
      autofocus: true,
      maxLength: 16,
      textCapitalization: TextCapitalization.words,
      decoration: const InputDecoration(
        labelText: 'Seu nome na mesa',
        hintText: 'Como os rivais vão te chamar',
      ),
      onSubmitted: (_) => _guest(),
    ),
    ..._errorLine(),
    const SizedBox(height: 12),
    CueButton(label: 'Jogar como convidado', onPressed: _guest),
  ];

  List<Widget> _loginForm() => [
    _Back(onTap: () => _go(EntryMode.choose)),
    Text('Entrar.', style: TvType.title(36)),
    const SizedBox(height: 4),
    const _Lead('Com a conta, seus amigos te encontram.'),
    const SizedBox(height: 20),
    AutofillGroup(
      child: Column(
        children: [
          TextField(
            controller: _user,
            autofocus: true,
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.next,
            autofillHints: const [AutofillHints.username, AutofillHints.email],
            decoration: const InputDecoration(labelText: 'Usuário ou email'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _pass,
            obscureText: true,
            autofillHints: const [AutofillHints.password],
            decoration: const InputDecoration(labelText: 'Senha'),
            onSubmitted: (_) => _submit(),
          ),
        ],
      ),
    ),
    ..._errorLine(),
    const SizedBox(height: 20),
    CueButton(label: 'Entrar', onPressed: widget.account.busy ? null : _submit),
    const SizedBox(height: 8),
    Row(
      children: [
        TextButton(
          onPressed: () => _go(EntryMode.forgot),
          child: const Text('ESQUECI A SENHA'),
        ),
        const Spacer(),
        TextButton(
          onPressed: () => _go(EntryMode.register),
          child: const Text('CRIAR CONTA'),
        ),
      ],
    ),
  ];

  List<Widget> _registerForm() => [
    _Back(onTap: () => _go(EntryMode.choose)),
    Text('Criar conta.', style: TvType.title(36)),
    const SizedBox(height: 4),
    const _Lead('Seu nome de usuário é o nome que aparece na mesa.'),
    const SizedBox(height: 20),
    AutofillGroup(
      child: Column(
        children: [
          TextField(
            controller: _user,
            autofocus: true,
            textInputAction: TextInputAction.next,
            autofillHints: const [AutofillHints.newUsername],
            decoration: const InputDecoration(
              labelText: 'Usuário',
              helperText: '3 a 20 letras, números, ponto, hífen ou _',
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.next,
            autofillHints: const [AutofillHints.email],
            decoration: const InputDecoration(
              labelText: 'Email',
              helperText: 'Para confirmar a conta e recuperar a senha',
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _pass,
            obscureText: true,
            autofillHints: const [AutofillHints.newPassword],
            decoration: const InputDecoration(
              labelText: 'Senha',
              helperText: 'Pelo menos 6 caracteres',
            ),
            onSubmitted: (_) => _submit(),
          ),
        ],
      ),
    ),
    ..._errorLine(),
    const SizedBox(height: 20),
    CueButton(
      label: 'Criar conta',
      onPressed: widget.account.busy ? null : _submit,
    ),
    const SizedBox(height: 8),
    TextButton(
      onPressed: () => _go(EntryMode.login),
      child: const Text('JÁ TENHO CONTA'),
    ),
  ];

  List<Widget> _forgotForm() => [
    _Back(onTap: () => _go(EntryMode.login)),
    Text('Esqueci a senha.', style: TvType.title(36)),
    const SizedBox(height: 4),
    const _Lead('Mandamos um link para você criar uma senha nova.'),
    const SizedBox(height: 20),
    TextField(
      controller: _email,
      autofocus: true,
      keyboardType: TextInputType.emailAddress,
      autofillHints: const [AutofillHints.email],
      decoration: const InputDecoration(labelText: 'Email da conta'),
      onSubmitted: (_) => _submit(),
    ),
    ..._errorLine(),
    if (_sent != null) ...[
      const SizedBox(height: 12),
      Text(
        _sent!,
        style: const TextStyle(
          fontFamily: TvType.sans,
          fontSize: 15,
          color: Tv.proven,
        ),
      ),
    ],
    const SizedBox(height: 20),
    CueButton(
      label: _sent == null ? 'Mandar link' : 'Mandar de novo',
      onPressed: widget.account.busy ? null : _submit,
    ),
  ];

  List<Widget> _errorLine() => [
    if (_error != null) ...[
      const SizedBox(height: 12),
      Text(
        _error!,
        style: const TextStyle(fontFamily: TvType.sans, color: Tv.carmineText),
      ),
    ],
  ];
}

/// A conta logada: nome, email e se ele já foi confirmado.
class _AccountView extends StatefulWidget {
  const _AccountView({required this.account});
  final AccountService account;

  @override
  State<_AccountView> createState() => _AccountViewState();
}

class _AccountViewState extends State<_AccountView> {
  String? _note;
  bool _noteBad = false;

  @override
  void initState() {
    super.initState();
    // O email pode ter sido confirmado no navegador.
    widget.account.refresh();
  }

  Future<void> _resend() async {
    final r = await widget.account.resendVerification();
    if (!mounted) return;
    setState(() {
      _noteBad = !r.ok;
      _note = r.ok
          ? 'Link enviado. Confira também o spam.'
          : (r.message ?? 'Não deu certo.');
    });
  }

  @override
  Widget build(BuildContext context) {
    final a = widget.account;
    final u = a.user!;
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('NA MESA COMO', style: TvType.credit(11)),
            const SizedBox(height: 2),
            Text(u.username, style: TvType.title(40)),
            const SizedBox(height: 16),
            if (u.email == null)
              const _Lead('Esta conta é de antes do email.')
            else ...[
              Text(
                u.email!,
                style: TvType.name(18, color: Tv.credit),
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 4),
              Text(
                u.emailVerified ? 'EMAIL CONFIRMADO' : 'EMAIL NÃO CONFIRMADO',
                style: TvType.credit(
                  11,
                  color: u.emailVerified ? Tv.proven : Tv.carmineText,
                  weight: FontWeight.w700,
                ),
              ),
              if (!u.emailVerified) ...[
                const SizedBox(height: 12),
                CueButton(
                  label: 'Mandar o link de novo',
                  quiet: true,
                  onPressed: a.busy ? null : _resend,
                ),
              ],
            ],
            if (_note != null) ...[
              const SizedBox(height: 12),
              Text(
                _note!,
                style: TextStyle(
                  fontFamily: TvType.sans,
                  fontSize: 15,
                  color: _noteBad ? Tv.carmineText : Tv.proven,
                ),
              ),
            ],
            const SizedBox(height: 24),
            const Divider(),
            TextButton(
              onPressed: () async {
                await a.logout();
                if (context.mounted) Navigator.of(context).pop();
              },
              child: const Text('SAIR DA CONTA'),
            ),
          ],
        ),
      ),
    );
  }
}

class _Lead extends StatelessWidget {
  const _Lead(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Text(
    text,
    style: const TextStyle(
      fontFamily: TvType.sans,
      fontSize: 15,
      color: Tv.creditDim,
    ),
  );
}

class _Back extends StatelessWidget {
  const _Back({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Align(
    alignment: Alignment.centerLeft,
    child: IconButton(
      tooltip: 'Voltar',
      onPressed: onTap,
      icon: const Icon(Icons.arrow_back, color: Tv.creditDim),
    ),
  );
}
