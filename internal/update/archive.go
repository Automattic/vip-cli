package update

import (
	"archive/tar"
	"compress/gzip"
	"debug/elf"
	"debug/macho"
	"debug/pe"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

const maxArchive int64 = 128 << 20
const maxExtracted int64 = 256 << 20

type Bundle struct{ Dir, CLI, Helper string }

func Extract(archivePath, stageDir string, p Platform) (Bundle, error) {
	empty := Bundle{}
	a, err := os.Open(archivePath)
	if err != nil {
		return empty, err
	}
	defer a.Close()
	gz, err := gzip.NewReader(a)
	if err != nil {
		return empty, err
	}
	defer gz.Close()
	limited := &io.LimitedReader{R: gz, N: maxExtracted + (1 << 20) + 1}
	tr := tar.NewReader(limited)
	cli, helper := p.names()
	expected := map[string]bool{cli: false, helper: false}
	var total int64
	for {
		h, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return empty, err
		}
		if h.Typeflag != tar.TypeReg && h.Typeflag != tar.TypeRegA {
			return empty, fmt.Errorf("archive member %q is not a regular file", h.Name)
		}
		seen, ok := expected[h.Name]
		if !ok || seen {
			return empty, fmt.Errorf("unexpected or duplicate archive member %q", h.Name)
		}
		if h.Size <= 0 || h.Size > maxArchive || total+h.Size > maxExtracted {
			return empty, fmt.Errorf("archive payload exceeds size limit")
		}
		total += h.Size
		expected[h.Name] = true
		f, err := os.OpenFile(filepath.Join(stageDir, h.Name), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0700)
		if err != nil {
			return empty, err
		}
		_, err = io.CopyN(f, tr, h.Size)
		closeErr := f.Close()
		if err != nil {
			return empty, err
		}
		if closeErr != nil {
			return empty, closeErr
		}
	}
	// Consume the gzip trailer and reject non-padding data after tar EOF.
	tail, err := readBounded(limited, 1<<20)
	if err != nil {
		return empty, err
	}
	if limited.N <= 0 {
		return empty, fmt.Errorf("archive exceeds extraction limit")
	}
	for _, b := range tail {
		if b != 0 {
			return empty, fmt.Errorf("unexpected trailing archive data")
		}
	}
	for name, seen := range expected {
		if !seen {
			return empty, fmt.Errorf("archive missing %s", name)
		}
		if err := VerifyExecutable(filepath.Join(stageDir, name), p); err != nil {
			return empty, fmt.Errorf("verify %s: %w", name, err)
		}
	}
	return Bundle{Dir: stageDir, CLI: filepath.Join(stageDir, cli), Helper: filepath.Join(stageDir, helper)}, nil
}
func VerifyExecutable(path string, p Platform) error {
	switch p.OS {
	case "linux":
		f, err := elf.Open(path)
		if err != nil {
			return err
		}
		defer f.Close()
		machine := elf.EM_X86_64
		if p.Arch == "arm64" {
			machine = elf.EM_AARCH64
		}
		if f.Class != elf.ELFCLASS64 || f.Machine != machine || (f.Type != elf.ET_EXEC && f.Type != elf.ET_DYN) {
			return fmt.Errorf("wrong ELF executable target")
		}
	case "darwin":
		f, err := macho.Open(path)
		if err != nil {
			return err
		}
		defer f.Close()
		cpu := macho.CpuAmd64
		if p.Arch == "arm64" {
			cpu = macho.CpuArm64
		}
		if f.Cpu != cpu || f.Type != macho.TypeExec {
			return fmt.Errorf("wrong Mach-O executable target")
		}
	case "windows":
		f, err := pe.Open(path)
		if err != nil {
			return err
		}
		defer f.Close()
		if f.Machine != pe.IMAGE_FILE_MACHINE_AMD64 || f.OptionalHeader == nil || f.Characteristics&pe.IMAGE_FILE_EXECUTABLE_IMAGE == 0 || f.Characteristics&pe.IMAGE_FILE_DLL != 0 {
			return fmt.Errorf("wrong PE executable target")
		}
	default:
		return fmt.Errorf("unsupported executable platform")
	}
	return nil
}
