package main

import (
	"bufio"
	"encoding/csv"
	"fmt"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"runtime/pprof"
	"strconv"
	"strings"
	"sync"
	"time"
)

func main() {
	reportType := os.Args[1]
	inputFolder := os.Args[2]
	outputPath := os.Args[3]

	f, err := os.Create("cpu.prof")
	if err != nil {
		log.Fatal(err)
	}
	pprof.StartCPUProfile(f)
	defer pprof.StopCPUProfile()

	start := time.Now()
	switch strings.ToLower(reportType) {
	case "accounts":
		buildAccountReports(inputFolder, outputPath)
	default:
		lookUpAccount(inputFolder, outputPath)
	}
	duration := time.Since(start)
	fmt.Printf("Program finished in %dms\n", duration.Milliseconds())
}

// Report Function
func lookUpAccount(in, out string) {
	// records := &sync.Map{}
	records := map[string][][]float64{}
	mtx := &sync.Mutex{}
	readFiles(in, func(s string) {
		fields := strings.Split(strings.TrimSpace(s), ",")
		if len(fields) < 5 {
			return // avoid out-of-bounds
		}
		account := fields[1]
		debit := convToFloat64(fields[3])
		credit := convToFloat64(fields[4])

		delta := debit - credit
		mtx.Lock()
		defer mtx.Unlock()
		if _, ok := records[account]; !ok {
			records[account] = [][]float64{}
		}
		records[account] = append(records[account], []float64{debit, credit, delta})
	})

	//Print a table of results for one account with each live be debit, credit, delta and last line would be the sum of each
	for account, values := range records {
		var sum1 , sum2, sum3 float64
		for _, val := range values {
			sum1 += val[0];
			sum2 += val[1];
			sum3 += val[2];
			fmt.Printf("|%-25s|%-25v|%-25v|%-25v|\n", account, val[0], val[1], val[2])
		}
		fmt.Printf("|%-25s|%-25v|%-25v|%-25v|\n", account, sum1, sum2, sum3)
		break;
	}
}
func buildAccountReports(in, out string) {
	// records := &sync.Map{}
	records := map[string]float64{}
	mtx := &sync.Mutex{}
	readFiles(
		in,
		func(s string) {
			fields := strings.Split(s, ",")
			// fmt.Println(fields)
			if len(fields) < 5 {
				return // avoid out-of-bounds
			}
			account := fields[1]
			debit := convToFloat64(fields[3])
			credit := convToFloat64(fields[4])
			// log each field in a 10 span space
			// fmt.Printf("|%-20s|%-20s|%-20s|%-20s|%-20s|\n", fields[0], account, fields[2], fields[3], fields[4])
			// fmt.Printf("|%-20s|%-20s|%-20s|%-20v|%-20v|\n", fields[0], account, fields[2], debit, credit)


			delta := debit - credit
			mtx.Lock()
			defer mtx.Unlock()
			if _, ok := records[account]; !ok {
				records[account] = 0.0
			}
			records[account] += delta
		},
	)
	writeCSV(out, records)
}
func buildYearlyReports(in, out string) {

}
func buildFSReports(in, out string) {}

//Files Functions

func isCSVFile(info fs.FileInfo) bool {
	return !info.IsDir() && strings.HasSuffix(info.Name(), ".csv")
}

func readFiles(folderPath string, processline func(string)) {
	//Read all files in the folder and process them concurrently
	var wg sync.WaitGroup

	// count := 0
	err := filepath.Walk(folderPath, func(path string, info os.FileInfo, err error) error {
		// fmt.Printf("%d Processing file: %s with %v \n", count, path, isCSVFile(info))
		// if count > 3 {return nil;} 
		// count++
		if err != nil {
			log.Println(err)
			return err
		}
		if isCSVFile(info) {
			wg.Add(1)
			func(path string) {
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

func writeCSV(path string, records map[string]float64) error {
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
	fmt.Println(records)
	for account, balance := range records {
		fmt.Printf("|%-25s|%-25v|%-25s|\n",account, balance, strconv.FormatFloat(balance, 'f', 2, 64))
		err = writer.Write([]string{account, strconv.FormatFloat(balance, 'f', 2, 64)})
		if err != nil {
			fmt.Println(err)
		}
	}
	// records.Range(func(key, value interface{}) bool {
	// 	account, ok1 := key.(string)
	// 	balance, ok2 := value.(float64)
	// 	fmt.Println(account, ok1)
	// 	fmt.Println(balance, ok2)
	// 	if ok1 && ok2 {
	// 		if err := writer.Write([]string{
	// 			account,
	// 			strconv.FormatFloat(balance, 'f', 2, 64),
	// 		}); err != nil {
	// 			return false
	// 		}
	// 	}
	// 	return true
	// })
	return nil
}

func convToFloat64(s string) float64 {
	// if s == "" {return 0;}
	value, err := strconv.ParseFloat(s, 64)
	if err != nil {

		// fmt.Printf("cannot convert %s \n", s)
		return 0
	}
	return value
}
