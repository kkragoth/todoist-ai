export function UserBubble({ text }: { text: string }) {
    return (
        <div className="max-w-[88%] self-end rounded-xl rounded-br-sm border border-border/60 bg-muted px-3 py-2 text-sm">
            {text}
        </div>
    );
}
