# PontoNorte - aplicativo do funcionário

Atualizado em 21/10/2026. Aplicativo Android 1.1.1 (Android 8 ou superior).

## Baixar

- APK: https://github.com/Delta-1/PontoNorte/releases/download/android-latest/PontoNorte.apk
- Painel do RH: https://delta-1.github.io/PontoNorte/

O funcionário não precisa cadastrar uma empresa nem criar uma conta avulsa. O RH cria seu acesso na empresa correta.

## Preparação pelo RH

1. Entre no painel da empresa e confira o código em Configurações.
2. Confira setor, jornada e os métodos de ponto habilitados. Para uso por botão, habilite **Botão no aplicativo**.
3. Em **Funcionários**, cadastre a pessoa, informe matrícula, usuário, setor, jornada e cargo/CBO.
4. Ao salvar, copie código da empresa, usuário e senha provisória. Entregue os dados individualmente.
5. Para quem já foi cadastrado, use **Funcionários > Acesso**. A senha antiga não é exibida; **Gerar nova senha** invalida a senha anterior e exibe uma nova senha provisória.
6. Se a empresa exigir autorização, espere o primeiro login do funcionário. Abra **Dispositivos**, localize o aparelho e selecione **Autorizar**.

## Instalação e primeiro acesso

1. Baixe o APK oficial no Android. Abra o arquivo e permita a instalação por essa fonte somente quando o Android solicitar.
2. Abra PontoNorte e selecione **Meu acesso**.
3. Preencha **Código da empresa**, **Usuário** e **Senha**, usando os três dados entregues pelo RH.
4. Selecione **Entrar**. Use **Manter conectado** somente no aparelho pessoal autorizado.
5. Em **Crie uma nova senha**, informe uma senha pessoal com pelo menos oito caracteres, confirme e selecione **Salvar senha**.
6. Em **Complete seus dados**, preencha contato e endereço, marque **Revisei meus dados** e selecione **Concluir meu cadastro**.
7. Se aparecer **Autorize este celular**, peça a autorização ao RH e depois selecione **Verificar autorização**.

## Bater ponto

1. Mantenha conexão com a internet. Abra **Ponto** e confira o próximo registro.
2. Toque em **Botão no aplicativo**. Se o método exigir localização, autorize a permissão e ative a localização do Android.
3. Espere o resultado. Confirme a linha e o horário em **Registros de hoje** antes de fechar o aplicativo.
4. Repita no início e fim do intervalo e na saída: **Entrada > Início do intervalo > Fim do intervalo > Saída**. A versão atual aceita quatro registros por dia.
5. Se o envio falhar, confira os registros antes de tentar novamente. Não existe confirmação de ponto sem envio ao servidor.

O método QR Code exige o QR individual do próprio usuário e câmera autorizada. Reconhecimento facial não está disponível sem configurar o provedor de prova de vida. A biometria do celular serve para desbloquear a sessão, quando disponível.

## Problemas comuns

- **Código, usuário ou senha incorretos:** confirme os três dados com o RH. CPF e e-mail de contato não substituem o usuário do login.
- **Perdeu a senha:** peça ao RH **Funcionários > Acesso > Gerar nova senha**. A recuperação por e-mail da empresa é destinada ao responsável.
- **Autorize este celular:** RH deve aprovar em **Dispositivos**. Troca de celular pode exigir nova autorização.
- **Localização obrigatória:** habilite GPS e a permissão do PontoNorte nas configurações Android. Se o método não exigir localização, o app não deve pedi-la para esse registro.
- **Licença pendente/vencida:** o administrador da empresa deve regularizar o acesso.
- **Atualização não instala:** preserve o histórico no servidor e confirme suas credenciais. Builds de teste antigos podem usar outra assinatura; se necessário, remova a instalação antiga e instale a atual. Isso encerra a sessão local.

## Antes do uso oficial

Faça um ciclo acompanhado no aparelho Android que será utilizado: login, senha pessoal, ficha, autorização, marcação, conferência no RH e reabertura do app. As permissões Android de GPS, câmera e biometria dependem do aparelho. O pacote disponibilizado pelo workflow atual é uma compilação de teste (`assembleDebug`), distribuída como pré-lançamento; a distribuição de produção com assinatura permanente exige configurar a chave de assinatura e gerar uma variante release.
