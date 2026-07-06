"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Result = {
  species_name: string;
  score_awarded: number;
  photo_signed_url: string | null;
};

export function SpotterClient() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("photo", file);
      const res = await fetch("/api/identify", { method: "POST", body: formData });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Identifieringen misslyckades.");
      setResult({
        species_name: body.sighting.species_name,
        score_awarded: body.sighting.score_awarded,
        photo_signed_url: body.sighting.photo_signed_url,
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Något gick fel.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="section">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={handleFileSelected}
        data-testid="photo-input"
      />
      <button
        type="button"
        className="upload-box"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        data-testid="spot-bird-button"
      >
        <div className="ut">{uploading ? "AI:n tittar på fotot…" : "📸 Spotta en fågel"}</div>
        <div className="us">Ta en bild eller ladda upp ett foto</div>
      </button>

      {error && (
        <div className="callout error" style={{ marginTop: 12 }} data-testid="identify-error">
          {error}
        </div>
      )}

      {result && (
        <div className="result-card" style={{ marginTop: 16 }} data-testid="identify-result">
          {result.photo_signed_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={result.photo_signed_url} alt={result.species_name} />
          )}
          <div className="result-species">{result.species_name}</div>
          <div className="result-score" data-testid="identify-score">
            +{result.score_awarded} poäng
          </div>
        </div>
      )}
    </div>
  );
}
