
export enum Speaker {
  User = 'user',
  Gemini = 'gemini',
}

export interface TranscriptMessage {
  speaker: Speaker;
  text: string;
  isFinal: boolean;
}
