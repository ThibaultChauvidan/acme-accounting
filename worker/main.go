package main

import (
	"bufio"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

// func main() {
// 	reportType := os.Args[1]
// 	inputFolder := os.Args[2]
// 	outputPath := os.Args[3]

// 	f, err := os.Create("cpu.prof")
// 	if err != nil {
// 		log.Fatal(err)
// 	}
// 	pprof.StartCPUProfile(f)
// 	defer pprof.StopCPUProfile()

// 	start := time.Now()
// 	switch strings.ToLower(reportType) {
// 	case "accounts":
// 		buildAccountReports(inputFolder, outputPath)
// 	case "yearly":
// 		buildYearlyReports(inputFolder, outputPath)
// 	case "fs":
// 		buildFSReports(inputFolder,outputPath)
// 	}
// 	duration := time.Since(start)
// 	fmt.Printf("Program finished in %dms\n", duration.Milliseconds())
// }

// Server

// ReportRequest represents the expected query parameters for building a report
type ReportRequest struct {
	ReportType  string `json:"reportType"`
	InputFolder string `json:"inputFolder"`
	OutputPath  string `json:"outputPath"`
}

// buildReportHandler handles the /build-report endpoint
func buildReportHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST method is allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ReportRequest
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(&req); err != nil {
		http.Error(w, "Invalid JSON body", http.StatusBadRequest)
		return
	}

	reportType := req.ReportType
	inputFolder := req.InputFolder
	outputPath := req.OutputPath

	if reportType == "" || inputFolder == "" || outputPath == "" {
		http.Error(w, "Missing required fields: reportType, inputFolder, outputPath", http.StatusBadRequest)
		return
	}

	start := time.Now()
	var result string

	switch strings.ToLower(reportType) {
	case "accounts":
		buildAccountReports(inputFolder, outputPath)
		result = "Account report generated"
	case "yearly":
		buildYearlyReports(inputFolder, outputPath)
		result = "Yearly report generated"
	case "fs":
		buildFSReports(inputFolder, outputPath)
		result = "FS report generated"
	default:
		http.Error(w, "Unknown reportType", http.StatusBadRequest)
		return
	}

	duration := time.Since(start)
	resp := map[string]interface{}{
		"message":  result,
		"duration": duration.Milliseconds(),
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func main() {
	http.HandleFunc("/build-report", buildReportHandler)
	fmt.Println("Server started at :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}

// Report Function
func buildAccountReports(in, out string) {
	records := &sync.Map{}
	readFiles(
		in,
		func(s string) {
			fields := strings.Split(s, ",")
			if len(fields) < 5 {
				return // avoid out-of-bounds
			}
			account := fields[1]
			debit := convToFloat64(fields[3])
			credit := convToFloat64(fields[4])

			delta := debit - credit
			current, _ := records.LoadOrStore(account,0.0)
			records.Store(account, current.(float64) + delta)
		},
	)
	writeCSV(out, records)
}
func buildYearlyReports(in, out string) {
	records := &sync.Map{}
	readFiles(
		in,
		func(s string) {
			fields := strings.Split(s, ",")
			if len(fields) < 5 {
				return // avoid out-of-bounds
			}
			sDate := fields[0]
			account := fields[1]
			if account != "Cash" {return;}

			// get year from string date
			date, _ := time.Parse("2019-12-31", sDate)
			year := date.Year()

			debit := convToFloat64(fields[3])
			credit := convToFloat64(fields[4])

			delta := debit - credit
			current, _ := records.LoadOrStore(year,0.0)
			records.Store(year, current.(float64) + delta)
		},
	)
	writeCSV(out, records)
}

func buildFSReports(in, out string) {}

//Files Functions

func isCSVFile(info fs.FileInfo) bool {
	return !info.IsDir() && strings.HasSuffix(info.Name(), ".csv")
}

func readFiles(folderPath string, processline func(string)) {
	//Read all files in the folder and process them concurrently
	var wg sync.WaitGroup

	err := filepath.Walk(folderPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			log.Println(err)
			return err
		}
		if isCSVFile(info) {
			wg.Add(1)
			go func(path string) {
				defer wg.Done()
				readCsv(path, processline)
			}(path)
		}
		return nil
	})
	if err != nil {
		log.Fatal(err)
	}
	wg.Wait()
}

// Function to read a CSV file line by line
func readCsv(filePath string, processLine func(string)) {
	//Skip if it's not a csv file
	if !strings.HasSuffix(filePath, ".csv") {
		return
	}
	file, err := os.Open(filePath)
	if err != nil {
		log.Printf("Error opening file %s: %v\n", filePath, err)
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		processLine(line) // Call a function that takes the line as param
	}

	if err := scanner.Err(); err != nil {
		log.Printf("Error reading CSV file %s: %v\n", filePath, err)
	}
}

func writeCSV(path string, records *sync.Map) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()

	writer := csv.NewWriter(f)

	defer writer.Flush()

	if err := writer.Write([]string{"Account", "Balance"}); err != nil {
		return err
	}
	records.Range(func(key, value interface{}) bool {
		account, ok1 := key.(string)
		balance, ok2 := value.(float64)
		if ok1 && ok2 {
			if err := writer.Write([]string{
				account,
				strconv.FormatFloat(balance, 'f', 2, 64),
			}); err != nil {
				return false
			}
		}
		return true
	})
	return nil
}

func convToFloat64(s string) float64 {
	if s == "" {return 0}
	value, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0
	}
	return value
}
