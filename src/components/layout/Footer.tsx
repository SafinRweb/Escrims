export default function Footer() {
    return (
        <footer className="bg-neutral-900 border-t border-white/5 py-12 mt-20">
            <div className="container mx-auto px-6 text-center text-gray-500 text-sm">
                <p>&copy; {new Date().getFullYear()} Escrims. All rights reserved.</p>
            </div>
        </footer>
    );
}
