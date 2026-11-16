# CIGKV / Zu — otimização do renderizador do trem

## Escopo

O protocolo Zu permanece inalterado: embarque em 0–3,4 s, rota até 8 s, portas em 8–16 s, chegada em 16 s e combate após 31 s. A mudança atua somente no cliente visual `TrainRide`.

## Otimização

Antes, cada `update()` e `cameraPose()` recalculava `dx`, `dz`, `hypot` e a orientação da rota. `cameraPose()` também criava dois `THREE.Vector3` novos por chamada. O renderizador agora:

- calcula uma vez o frame da rota (`ux`, `uz`, `rx`, `rz`, heading);
- reutiliza um buffer de pose compatível com a SSOT;
- reutiliza os buffers `cameraEye` e `cameraLook`;
- mantém `trainPoseAt()` intacta para consumidores que precisam de uma função pura com novo objeto;
- adiciona `trainPoseAtInto()` para o caminho de alta frequência.

Isso reduz trabalho matemático e pressão de garbage collection durante a viagem, sem mudar coordenadas, fases, janela de salto ou autoridade do servidor.

## Verificação

O teste `zu-train-protocol.test.js` compara a saída de `trainPoseAtInto()` com `trainPoseAt()` em pontos de todas as fases canônicas. A suíte de entrada/trem continua sendo o gate funcional; o aceite visual UE5 permanece separado.
