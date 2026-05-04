const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

/**
 * Dispara quando uma cotação é atualizada.
 * Se o status mudou PARA "aprovado", muda o pedido para "pedido_liberado".
 */
exports.liberarPedidoAoAprovarCotacao = functions.firestore
  .document("quotations/{quotId}")
  .onUpdate(async (change, context) => {
    const antes  = change.before.data();
    const depois = change.after.data();

    // Só age quando o status muda PARA "aprovado"
    if (antes.status === depois.status) return null;
    if (depois.status !== "aprovado")   return null;

    const orderId = depois.orderId;
    if (!orderId) return null;

    const orderRef  = admin.firestore().collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) return null;

    // Só muda se o pedido ainda estiver em andamento
    if (orderSnap.data().status !== "andamento") return null;

    await orderRef.update({
      status:             "pedido_liberado",
      liberadoEm:         admin.firestore.FieldValue.serverTimestamp(),
      cotacaoAprovadaId:  context.params.quotId,
      cotacaoFornecedor:  depois.fornecedorNome || "",
      cotacaoValor:       depois.valor          || 0,
    });

    console.log(`✅ Pedido ${orderId} → pedido_liberado (cotação ${context.params.quotId})`);
    return null;
  });
