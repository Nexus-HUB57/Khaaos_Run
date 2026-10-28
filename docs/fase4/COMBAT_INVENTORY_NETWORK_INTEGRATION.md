# Combat, inventory, loot e rede — integração UE5

## O que o código agora entrega

- O `UKhaaosSpeciesGAS` registra um `UKhaaosAttributeSet` no ASC do operativo. A inicialização usa a espécie e os stats base do ator; quando há linha correspondente na DataTable, aplica HP, energia, escudo e velocidade de movimento. HP e escudo são atributos GAS replicados; o dano mitigado consome escudo antes de HP.
- O `UKhaaosCombatPerkComponent` mantém até três perks, recebe definições contendo `UGameplayEffect` e aplica/remove os efeitos apenas no servidor. O loadout inicial é configurado por classe derivada do operativo ou pelo GameMode. Os IDs equipados são replicados para apresentação; os próprios efeitos são replicados pelo ASC.
- O `UKhaaosInventoryComponent` replica slots apenas ao dono, valida ID/slot/stack contra o AssetRegistry canônico (armas e loot) e aceita overrides de `ItemCatalog`. Clientes não concedem itens chamando `AddItem`: a concessão ocorre no servidor ou por `RequestPickup`, cujo destino valida autoridade, identidade cadastrada, capacidade e distância.
- Loot transferido mantém `FName ItemID` e quantidade. Drops são criados no servidor pela classe configurada em `DroppedPickupClass`; a remoção do slot só acontece após o spawn dar certo.
- Pickups são espacialmente relevantes, têm cull distance de 3.000 cm e baixa frequência/dormancy. Uma mudança de estado acorda o ator para replicação e o põe novamente em dormancy. O inventário owner-only evita enviar o conteúdo privado a todos os observadores.
- A ReplicationGraph agora resolve a configuração de classes herdada pelo ancestral mais próximo; subclasses de `PlayerState`, por exemplo, preservam a regra de relevância do tipo-base.

## Configuração de conteúdo necessária

1. Garanta que os `UKhaaosWeaponDataAsset` e `UKhaaosLootItemDataAsset` da partida estejam carregados pelo `UKhaaosAssetRegistrySubsystem`. O slot de arma é lido de `WeaponDataAsset.Slot` (`Primary`, `Secondary` ou `Melee`). Itens de defesa vão ao slot `Shield`; loot de mochila cujo ID contenha `backpack` ou `mochila` vai ao slot `Backpack`; os demais itens de loot vão a `Utility`. Se um projeto precisar de outro mapeamento, adicione uma entrada explícita no `ItemCatalog` do componente.
2. Crie uma classe Blueprint concreta derivada de `AKhaaosLootPickup`, atribua malha, materiais e efeitos visuais e configure essa classe em `DroppedPickupClass` nos defaults da classe do operativo. `AKhaaosLootPickup` é abstrata e não deve ser usada diretamente para spawn.
3. No fluxo de interação do jogador, chame `Inventory->RequestPickup(Pickup)` a partir do componente de inventário do operativo possuído. A chamada é uma solicitação; o servidor continua sendo o árbitro. A distância 3D padrão é 250 cm (`WorldPickupRangeCm`).
4. Crie efeitos GameplayEffect de perk e preencha `PerkCatalog` nos defaults. Cada registro precisa de `PerkId` único e classe de efeito. Configure `InitialPerkIds` ou atribua o loadout no servidor/GameMode antes do início da partida. Este componente deliberadamente não expõe uma RPC de cliente para trocar perks em combate.
5. Na DataTable de atributos de espécie, use IDs de linha correspondentes aos nomes do enum (`HURAN`, `KHAEL` etc.) e uma linha `Default` opcional. Sem linha, o código conserva os stats base do operativo.

## Limites desta entrega

O repositório não continha assets de loot visuais concretos nem um catálogo preenchido de perks GameplayEffect; o código disponibiliza os pontos de configuração, sem fabricar conteúdo fictício. A regra de classes da ReplicationGraph e os limites de relevância/dormancy foram ajustados, mas capacidade para concorrência real depende da configuração final do NetDriver/ReplicationGraph, dos mapas, do servidor dedicado e de perfil de rede em build empacotada. Nenhum build, teste, simulação ou benchmark foi executado nesta alteração.
