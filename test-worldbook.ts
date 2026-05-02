import { worldbookToCard, cardToWorldbook } from './src/utils/worldbookParser.ts';
import type { Worldbook } from './src/utils/worldbookParser.ts';

const mockWorldbook = {
  entries: {
    "1": { uid: 1, name: "Test Entry", content: "Some content", key: ["test"], comment: "" },
    "2": { uid: 2, key: ["key2"], content: "More content", comment: "" } // no name
  }
} as Worldbook;

const card = worldbookToCard(mockWorldbook);
console.log("Card representation:", JSON.stringify(card.data?.character_book, null, 2));

// Simulate translation
if (card.data?.character_book?.entries) {
  card.data.character_book.entries[0].content = "Translated content 1";
  card.data.character_book.entries[1].content = "Translated content 2";
}

const exported = cardToWorldbook(card, mockWorldbook);
console.log("Exported worldbook:", JSON.stringify(exported, null, 2));
